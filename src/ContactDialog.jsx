import React,{useEffect,useRef} from 'react';

export default function ContactDialog({children,onClose}){
 const ref=useRef(null);
 useEffect(()=>{
  const dialog=ref.current;
  const previous=document.body.style.overflow;
  const opener=document.activeElement;
  document.body.style.overflow='hidden';
  dialog.showModal();
  return()=>{dialog.close();document.body.style.overflow=previous;if(opener?.isConnected)opener.focus()};
 },[]);
 return <dialog ref={ref} className="contact-dialog" aria-label="Contact information" onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose()}}}>{children}</dialog>;
}
