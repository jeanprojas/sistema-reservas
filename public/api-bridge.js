(() => {
  const API='https://ddufmiiaxmvobbjtolgm.supabase.co/functions/v1/vip-api-v2';
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{
    const raw=typeof input==='string'?input:input?.url;
    let source;try{source=new URL(raw,window.location.href)}catch{return nativeFetch(input,init)}
    if(!source.pathname.startsWith('/api/'))return nativeFetch(input,init);
    const target=API+source.pathname.replace(/^\/api/,'')+source.search;
    const headers=new Headers((typeof input==='object'&&input?.headers)||init.headers||{});
    const token=localStorage.getItem('vip_session_token');if(token)headers.set('Authorization',`Bearer ${token}`);
    const response=await nativeFetch(target,{...init,headers});
    try{const d=await response.clone().json();if(d?.token)localStorage.setItem('vip_session_token',d.token);if(d?.usuario&&!d.username){d.username=d.usuario.username;d.rol=d.usuario.rol;d.sede=d.usuario.sede}}catch{}
    return response;
  };
})();
