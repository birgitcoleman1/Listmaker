import {useEffect,useState} from 'react';
export default function useInitialHero(provided=''){const [url,U]=useState(provided);useEffect(()=>{if(provided){U(provided);return}let active=true;fetch('/.netlify/functions/website-hero').then(r=>r.ok?r.json():null).then(result=>{if(active&&result?.url)U(result.url)}).catch(()=>{});return()=>{active=false}},[provided]);return url}
