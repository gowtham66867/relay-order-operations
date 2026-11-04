import {Problem,requireThat} from '../domain.js';
// Adapter library only. The owner-private Site does not expose a public webhook route.
export function verifySubscription(url,verifyToken){
 const u=new URL(url);requireThat(verifyToken,'WhatsApp verification token is not configured',503);
 requireThat(u.searchParams.get('hub.mode')==='subscribe'&&u.searchParams.get('hub.verify_token')===verifyToken,'Invalid webhook verification request',403);
 const challenge=u.searchParams.get('hub.challenge');requireThat(challenge&&challenge.length<=500,'Missing or invalid challenge');return challenge;
}
export async function verifySignature(raw,signature,appSecret){
 requireThat(appSecret,'WhatsApp app secret is not configured',503);
 requireThat(typeof signature==='string'&&/^sha256=[a-f0-9]{64}$/i.test(signature),'Missing or malformed webhook signature',401);
 const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(appSecret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const hex=signature.slice(7),bytes=Uint8Array.from(hex.match(/../g),x=>parseInt(x,16));
 requireThat(await crypto.subtle.verify('HMAC',key,bytes,encoder.encode(raw)),'Invalid webhook signature',401);
}
export function normalizeWebhook(payload,phoneToMerchant){
 requireThat(payload?.object==='whatsapp_business_account','Unsupported webhook object');
 const messages=[],unsupported=[];
 for(const entry of payload.entry||[])for(const change of entry.changes||[]){
  if(change.field!=='messages')continue;
  const value=change.value,phoneId=value?.metadata?.phone_number_id;
  if(!(value?.messages||[]).length)continue;
  const merchant=Object.hasOwn(phoneToMerchant,phoneId)?phoneToMerchant[phoneId]:null;
  requireThat(merchant,'Unmapped receiving phone number',403);
  for(const m of value.messages){
   requireThat(typeof m.id==='string'&&typeof m.from==='string','Malformed WhatsApp message');
   if(m.type!=='text'){unsupported.push({id:m.id,type:m.type||'unknown',merchant});continue;}
   requireThat(typeof m.text?.body==='string'&&m.text.body.length<=6000,'Invalid or oversized WhatsApp text');
   messages.push({id:m.id,merchant,from:m.from,text:m.text.body,timestamp:m.timestamp,source:'whatsapp'});
  }
 }
 return {messages,unsupported};
}
