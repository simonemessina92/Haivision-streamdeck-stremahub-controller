'use strict';
// Serial repeat: never accumulate queued camera writes. Release cancels all
// future repeats; a request already on the network may finish.
class Hold {
 constructor({delay=350,interval=100,onError=()=>{}}={}){this.delay=delay;this.interval=interval;this.onError=onError;this.active=new Map();}
 start(id,task){
  this.stop(id);const state={cancelled:false,timer:null};this.active.set(id,state);
  const run=async(first)=>{if(state.cancelled)return;try{await task();}catch(e){this.stop(id);this.onError(e);return;}if(!state.cancelled)state.timer=setTimeout(()=>run(false),first?this.delay:this.interval);};
  void run(true);
 }
 stop(id){const s=this.active.get(id);if(s){s.cancelled=true;clearTimeout(s.timer);this.active.delete(id);}}
 stopAll(){for(const id of [...this.active.keys()])this.stop(id);}
}
module.exports={Hold};
