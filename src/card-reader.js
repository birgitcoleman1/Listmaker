import {parseCard} from './lib.js';

// Two layouts are compared because business cards rarely form a single text block.
export function recognitionScore(result) {
 const fields=parseCard(result.text||'');
 return (Number(result.confidence)||0)+(fields.email?20:0)+(fields.phone?10:0)+(fields.first_name?5:0);
}
export function chooseRecognition(results) {
 return results.slice().sort((a,b)=>recognitionScore(b)-recognitionScore(a))[0]||{text:'',confidence:0};
}

export async function prepareCardImage(file,{rotation=0,trim=0,enhance=false}={}) {
 const src=URL.createObjectURL(file);
 const image=new Image();
 try {image.src=src;await image.decode();} finally {URL.revokeObjectURL(src);}
 const crop=Math.min(.2,Math.max(0,trim/100));
 const width=image.naturalWidth*(1-crop*2),height=image.naturalHeight*(1-crop*2);
 const scale=Math.min(2,2400/Math.max(width,height));
 const quarter=rotation%180!==0;
 const canvas=document.createElement('canvas');
 canvas.width=Math.round((quarter?height:width)*scale);
 canvas.height=Math.round((quarter?width:height)*scale);
 const ctx=canvas.getContext('2d',{willReadFrequently:enhance});
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);
 ctx.drawImage(image,image.naturalWidth*crop,image.naturalHeight*crop,width,height,-width*scale/2,-height*scale/2,width*scale,height*scale);
 if(enhance){
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),histogram=new Uint32Array(256);
  let sum=0;
  for(let i=0;i<pixels.data.length;i+=4){const gray=Math.round(.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2]);histogram[gray]++;sum+=gray;}
  const count=canvas.width*canvas.height;let low=0,high=255,total=0;
  for(let i=0;i<256;i++){total+=histogram[i];if(total>=count*.02){low=i;break;}}
  total=0;for(let i=255;i>=0;i--){total+=histogram[i];if(total>=count*.02){high=i;break;}}
  const invert=sum/count<110;
  for(let i=0;i<pixels.data.length;i+=4){const gray=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2];let value=Math.max(0,Math.min(255,(gray-low)*255/Math.max(30,high-low)));if(invert)value=255-value;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;}
  ctx.putImageData(pixels,0,0);
 }
 return canvas;
}

export async function readCard(worker,original,enhanced,onPass=()=>{}) {
 const results=[];
 await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1',user_defined_dpi:'300'});
 onPass(1);results.push((await worker.recognize(original,{rotateAuto:true})).data);
 await worker.setParameters({tessedit_pageseg_mode:'3'});
 onPass(2);results.push((await worker.recognize(enhanced,{rotateAuto:true})).data);
 return chooseRecognition(results);
}
