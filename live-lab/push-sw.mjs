// A payloadless push carries no conversation or customer data through the push
// service. The same-origin, cookie-authenticated lookup supplies the destination.
export const serviceWorker = `self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let reminder=null;
    try{const r=await fetch('/api/push/pending',{credentials:'same-origin',cache:'no-store'});
      if(r.ok)reminder=(await r.json()).reminder}catch{}
    if(!reminder)return;
    const url='/?session='+encodeURIComponent(reminder.sessionId)+'&reminder='+encodeURIComponent(reminder.id);
    await self.registration.showNotification('Snap n Dish',{body:'Come back to your meal conversation.',tag:reminder.id,data:{url,reminderId:reminder.id}});
    try{await fetch('/api/push/ack',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({reminderId:reminder.id,kind:'displayed'})})}catch{}
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const data=event.notification.data||{};
    if(data.reminderId)try{await fetch('/api/push/ack',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({reminderId:data.reminderId,kind:'clicked'})})}catch{}
    const target=new URL(data.url||'/',self.location.origin).href;
    const all=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of all){if(client.url===target){await client.focus();return}}
    await clients.openWindow(target);
  })());
});`;
