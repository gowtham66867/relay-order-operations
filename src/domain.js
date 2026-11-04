export class Problem extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const requireThat = (condition, message, status = 400) => { if (!condition) throw new Problem(status, message); };
export const stamp = () => new Date().toISOString();
export function record(state, type, detail) {
  state.audit.push({ id: crypto.randomUUID(), at: stamp(), type, detail });
}
export function seed() {
  const state = {
    catalog: [
      { sku: 'SW-10', name: 'Classic wall switch', unit: 'units', price: 150, stock: 18 },
      { sku: 'SW-20', name: 'Premium wall switch', unit: 'units', price: 180, stock: 45 },
      { sku: 'CB-16', name: '16A circuit breaker', unit: 'units', price: 420, stock: 60 }
    ],
    orders: [
      { id: 'ORD-1042', customer: 'Kaveri Electricals', sku: 'SW-10', quantity: 20, allocated: 0, price: 150, delivery: '2026-11-05', version: 0, status: 'Awaiting allocation' },
      { id: 'ORD-1043', customer: 'North Star Traders', sku: 'CB-16', quantity: 12, allocated: 0, price: 420, delivery: '2026-11-06', version: 0, status: 'Awaiting allocation' },
      { id: 'ORD-1044', customer: 'Urban Build Supply', sku: 'SW-20', quantity: 10, allocated: 0, price: 180, delivery: '2026-11-06', version: 0, status: 'Awaiting allocation' }
    ], messages: [], cases: [], audit: []
  };
  record(state, 'workspace.created', 'Synthetic distributor dataset loaded. No external systems connected.');
  const sample={id:'demo-stock-001',orderId:'ORD-1042',text:'Please make that 30 units, same price. Deliver on 2026-11-05.'};
  ingest(state,sample,demoExtract(sample.text,state.orders[0]),'demo');
  return state;
}
export function available(state, sku, excludingOrderId) {
  const product = state.catalog.find(p => p.sku === sku);
  requireThat(product, 'Unknown product');
  return product.stock - state.orders.filter(o => o.sku === sku && o.id !== excludingOrderId).reduce((n, o) => n + o.allocated, 0);
}
export function getOrder(state, id) {
  const order = state.orders.find(o => o.id === id);
  requireThat(order, 'Order not found', 404); return order;
}
// Demo grammar is deliberately bounded; it never pretends to perform model inference.
export function demoExtract(text, order) {
  const qtyMatch = text.match(/\b(\d+)\s*(?:units?|pieces?)\b/i) || text.match(/(?:make (?:that|it)|change (?:that|it|quantity) to|need|send|quantity[: ]+)\s*(\d+)/i);
  const quantity = qtyMatch ? Number(qtyMatch[1]) : null;
  const date = text.match(/\b20\d\d-\d\d-\d\d\b/)?.[0] || null;
  const price = text.match(/\b(?:price|at)\b\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)/i);
  return { kind:/\bcancel (?:my |the |this )?order\b/i.test(text)?'cancel':'amend', quantity, delivery: date, requestedPrice: price ? Number(price[1]) : null, evidence: [text], summary: quantity ? `Request to change ${order.id} to ${quantity} units.` : 'Review requested delivery or pricing change.' };
}
export function validateIntent(intent, text) {
  requireThat(intent && typeof intent === 'object', 'The model did not return an intent', 502);
  const quantity = intent.quantity ?? null;
  requireThat(quantity === null || (Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 10000), 'Quantity must be a whole number between 1 and 10,000');
  const delivery = intent.delivery ?? null;
  requireThat(delivery === null || (typeof delivery === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(delivery) && Number.isFinite(Date.parse(delivery)) && new Date(delivery).toISOString().slice(0,10) === delivery), 'Delivery must be a valid ISO date');
  const requestedPrice = intent.requestedPrice ?? null;
  requireThat(requestedPrice === null || (Number.isFinite(requestedPrice) && requestedPrice >= 0 && requestedPrice <= 1000000), 'Invalid requested price');
  requireThat(Array.isArray(intent.evidence) && intent.evidence.length > 0 && intent.evidence.length <= 5 && intent.evidence.every(q => typeof q === 'string' && q.trim().length > 0 && text.includes(q)), 'Evidence must quote the original message exactly', 422);
  // Numeric grounding is a lexical check, not a claim that semantic correctness is proven.
  const quoted = intent.evidence.join(' ');
  requireThat(quantity === null || new RegExp(`(^|[^0-9])${quantity}([^0-9]|$)`).test(quoted), 'Requested quantity is absent from cited evidence', 422);
  requireThat(delivery === null || quoted.includes(delivery), 'Requested date is absent from cited evidence', 422);
  requireThat(requestedPrice === null || new RegExp(`(^|[^0-9.])${String(requestedPrice).replace('.', '\\.')}(?![0-9]|\\.[0-9])`).test(quoted), 'Requested price is absent from cited evidence', 422);
  requireThat(quantity !== null || delivery !== null || requestedPrice !== null, 'No supported order change found. Specify a quantity, ISO delivery date, or price.');
  return {quantity, delivery, requestedPrice, evidence: intent.evidence, summary: String(intent.summary || 'Customer order change').slice(0,400)};
}
export function makePlan(state, order, intent) {
  const quantity = intent.quantity ?? order.quantity;
  const delivery = intent.delivery ?? order.delivery;
  const stock = available(state, order.sku, order.id);
  const priceConflict = intent.requestedPrice !== null && intent.requestedPrice !== order.price;
  const shortage = Math.max(0, quantity - stock);
  const flags = [];
  if (shortage) flags.push({code: 'STOCK_SHORTAGE', label: `${shortage} units cannot be allocated`, detail: `${quantity} requested · ${stock} available for this order`});
  if (priceConflict) flags.push({code: 'PRICE_CONFLICT', label: 'Requested price differs from agreed price', detail: `₹${intent.requestedPrice} requested · ₹${order.price} agreed. Relay preserves the agreed price.`});
  if (delivery !== order.delivery) flags.push({code: 'DELIVERY_CHANGE', label: 'Delivery date needs confirmation', detail: 'Inventory availability does not verify transport capacity.'});
  const choices = [];
  if (stock > 0) {
    const allocate = Math.min(quantity, stock);
    choices.push({id:'allocate', label: shortage ? `Allocate ${allocate} now, backorder ${shortage}` : `Confirm ${quantity} units`, sku:order.sku, quantity, allocated:allocate, price:order.price, delivery, requiresCustomerConfirmation: true});
  }
  if (shortage && order.sku === 'SW-10') {
    const alt = state.catalog.find(p=>p.sku === 'SW-20');
    if (available(state,alt.sku,order.id) >= quantity) choices.push({id:'substitute',label:`Offer ${quantity} premium switches at ₹${alt.price}/unit`,sku:alt.sku,quantity,allocated:quantity,price:alt.price,delivery,requiresCustomerConfirmation:true});
  }
  return {quantity, shortage, priceConflict, stock, flags, choices, exposure:shortage * order.price};
}
export function ingest(state, input, intent, mode) {
  const duplicate = state.messages.find(m=>m.id === input.id);
  if (duplicate) {
    requireThat(duplicate.orderId === input.orderId && duplicate.text === input.text, 'Message ID already belongs to different content', 409);
    return {duplicate:true,caseId:duplicate.caseId};
  }
  const order = getOrder(state,input.orderId);
  const checked = validateIntent(intent,input.text);
  const plan = makePlan(state,order,checked);
  const item = {id:crypto.randomUUID(),orderId:order.id,messageId:input.id,createdAt:stamp(),status:'pending',baseVersion:order.version,intent:checked,plan,mode};
  state.messages.push({id:input.id,orderId:input.orderId,text:input.text,at:stamp(),caseId:item.id});
  state.cases.push(item);
  record(state,'message.analyzed',`${input.id} → ${order.id}; ${mode}; ${plan.flags.length} exceptions; operator review required.`);
  return {duplicate:false,caseId:item.id};
}
export function decide(state, input) {
  const item = state.cases.find(c=>c.id === input.caseId);
  requireThat(item,'Case not found',404);
  requireThat(item.status === 'pending','Case has already been resolved',409);
  if (input.action === 'dismiss') { item.status='dismissed'; record(state,'case.dismissed',`${item.orderId}: operator dismissed proposed change.`); return; }
  requireThat(input.action === 'approve','Unknown decision');
  requireThat(input.customerConfirmed === true,'Confirm customer acceptance before applying this change',422);
  const order = getOrder(state,item.orderId);
  requireThat(order.version === item.baseVersion,'Order changed since analysis. Analyze a new message before approving.',409);
  // Always recompute against current inventory; never trust a client-supplied quantity or price.
  const fresh = makePlan(state,order,item.intent);
  const choice = fresh.choices.find(c=>c.id === input.choiceId);
  const original = item.plan.choices.find(c=>c.id === input.choiceId);
  requireThat(choice && original && JSON.stringify(choice) === JSON.stringify(original),'Stock or price changed. Analyze again before approving.',409);
  Object.assign(order,{sku:choice.sku,quantity:choice.quantity,allocated:choice.allocated,price:choice.price,delivery:choice.delivery,version:order.version+1,status:choice.allocated < choice.quantity?'Partially allocated':'Allocated'});
  item.status='approved'; item.resolvedAt=stamp(); item.applied=choice;
  record(state,'order.updated',`${order.id}: ${choice.allocated}/${choice.quantity} ${choice.sku} allocated at ₹${choice.price}/unit. Customer acceptance confirmed by operator. No message sent.`);
}
export function customerDraft(state,item,choiceId) {
  const order=getOrder(state,item.orderId);
  if(item.intent.kind==='cancel')return `Hello ${order.customer}, please confirm cancellation of ${order.id}. After operator approval we will release its reserved stock. No refund or external action is performed by this prototype.`;
  const c=item.plan.choices.find(c=>c.id===choiceId) || item.plan.choices[0];
  if(!c) return `Hello ${order.customer}, we are reviewing availability for ${item.plan.quantity} units. We will confirm a feasible fulfillment option before updating your order.`;
  const remaining=c.quantity-c.allocated;
  return `Hello ${order.customer}, for ${order.id} we can propose ${c.allocated} units of ${state.catalog.find(p=>p.sku===c.sku).name} at ₹${c.price} per unit${remaining?`, with ${remaining} units on backorder`:''}. Requested delivery: ${c.delivery} (transport confirmation pending). Please confirm whether you accept this option. Your order will only be updated after confirmation.`;
}
