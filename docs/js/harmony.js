/* Global chord timeline. Voice-leading searches adjacent inversions for the
   smallest total pitch movement, with a fixed register per input octave. */
(() => {
  "use strict";
  const {h,btn}=App.UI;
  const types={maj:[0,4,7],min:[0,3,7],dim:[0,3,6],aug:[0,4,8],sus2:[0,2,7],sus4:[0,5,7],"7":[0,4,7,10],maj7:[0,4,7,11],min7:[0,3,7,10],m7b5:[0,3,6,10],dim7:[0,3,6,9],"5":[0,7]};
  const modes=["off","root","chord"],memo=new WeakMap();
  App.extendProject({load(P,raw) {
    const H=raw.harmony||{};
    P.harmony={chords:(Array.isArray(H.chords)?H.chords:[]).slice(0,1024).filter(c=>c&&Number.isFinite(c.root)&&Object.hasOwn(types,c.type)).map(c=>({
      root:App.clamp(Math.round(c.root),0,11),type:c.type,bars:App.clamp(Math.round(Number(c.bars)||1),1,16),...(c.rest?{rest:true}:{}),...(Number.isFinite(c.steps)&&c.steps>0?{steps:Math.min(65536,Math.round(c.steps))}:{})
    })),follow:Array.from({length:8},(_,i)=>modes.includes(H.follow?.[i])?H.follow[i]:"off")};
  }});
  const duration=P=>P.harmony?.follow.some(m=>m!=="off") ? (App.Arrangement.chordList(P).at(-1)?.end||0) : 0;
  function inversion(chord,near,prev) {
    const intervals=types[chord.type];
    let best=null,cost=Infinity;
    for(let octave=-2;octave<=10;octave++) for(let turn=0;turn<intervals.length;turn++) {
      const notes=intervals.map((_,i)=>octave*12+chord.root+intervals[(turn+i)%intervals.length]+(turn+i>=intervals.length?12:0));
      if (notes[0]<0 || notes.at(-1)>127) continue;
      const center=notes.reduce((a,n)=>a+n,0)/notes.length;
      const move=prev ? notes.reduce((a,n,i)=>a+Math.abs(n-prev[Math.round(i*(prev.length-1)/(notes.length-1))]),0) : 0;
      const score=move+Math.abs(center-near)*(prev ? .65 : 1)+(prev?0:(turn ? .45 : 0));
      if(score<cost){cost=score;best=notes;}
    }
    return best;
  }
  function state(P,t,at) {
    const H=P.harmony,T=P.tracks[t],mode=H?.follow[t];
    if (!H?.chords.length || !mode || mode==="off" || T.kind==="kit" || (T.kind==="smp"&&T.smp.mode===1)) return null;
    let data=memo.get(H);
    if(!data || data.meters!==P.arrangement?.meters || data.sig!==P.sig) {
      const ends=App.Arrangement.chordList(P).map(c=>c.end);
      data={meters:P.arrangement?.meters,sig:P.sig,steps:ends.at(-1),ends,voices:new Map()};memo.set(H,data);
    }
    const step=at%data.steps,index=data.ends.findIndex(end=>step<end),chord=H.chords[index];
    // A timeline with no length has no chord at any step.
    if(!chord || chord.rest)return null;
    // Consecutive identical assignments sustain across the edit boundary.
    const different=c=>c.rest || c.root!==chord.root || (mode==="chord"&&c.type!==chord.type);
    const previous=H.chords[(index+H.chords.length-1)%H.chords.length];
    const change=step===(index ? data.ends[index-1] : 0) && different(previous);
    let remain=Infinity;
    if(H.chords.length>1){
      let distance=data.ends[index]-step;
      for(let k=1;k<H.chords.length;k++){
        const next=H.chords[(index+k)%H.chords.length];
        if(different(next)){remain=distance;break;}
        const i=(index+k)%H.chords.length;distance+=data.ends[i]-(i?data.ends[i-1]:0);
      }
    }
    return {mode,chord,data,index,remain,change};
  }
  function pitches(P,t,n,at,position=state(P,t,at)) {
    if(!position)return [n];
    const {mode,chord,data,index}=position,H=P.harmony;
    if(mode==="root") {
      // Nearest octave of the current root keeps bass lines inside the played register.
      let pitch=n+((chord.root-n%12+18)%12)-6;
      if(pitch<0)pitch+=12;if(pitch>127)pitch-=12;return [pitch];
    }
    const register=Math.floor(n/12);
    if(!data.voices.has(register)) {
      let prev=null;
      data.voices.set(register,H.chords.map(c=>c.rest ? [] : prev=inversion(c,register*12+5,prev)));
    }
    return data.voices.get(register)[index];
  }
  function open() {
    const P=App.P,H=P.harmony,node=App.Workspace.begin("Chord timeline"),body=h("div.dlg-body.pf-body");
    const {field,select,num}=App.Live,chords=H.chords.map(c=>({...c})),follow=H.follow.slice();
    const list=h("select.pf-take-list",{size:6,"aria-label":"Chord progression"});
    const root=select("Chord root",App.NOTES.map((s,i)=>[i,s]),P.key),type=select("Chord quality",Object.keys(types).map(k=>[k,k]),"maj");
    const bars=num("Chord duration in bars",1,16,1),total=h("output"),status=h("output");
    // An arrangement edit stores a chord's length in steps. Bars shows that length where it is whole bars,
    // and Update keeps the stored length unless Bars was changed.
    let spans=[],shown=1;
    function read(){
      const i=list.selectedIndex,c=chords[i];if(!c)return;
      const a=App.Conductor.position(P,spans[i].from),b=App.Conductor.position(P,spans[i].end);
      shown=c.steps && !a.inside && !b.inside ? App.clamp(b.bar-a.bar,1,16) : c.bars;
      root.value=c.root;type.value=c.type;bars.value=shown;
    }
    function draw(i) {
      spans=App.Arrangement.chordList({...P,harmony:{chords}});
      list.replaceChildren(...chords.map((c,k)=>{const s=spans[k],bar=App.Conductor.position(P,s.from).bar+1;
        return h("option",{value:k,text:"BAR "+App.pad2(bar)+"    "+(c.rest?"—":App.NOTES[c.root]+" "+c.type)+"    "+(c.steps?c.steps+" steps":"× "+c.bars)});}));
      list.selectedIndex=Math.min(i,chords.length-1);total.textContent=(spans.at(-1)?.end||0)+" steps";read();
    }
    list.onchange=read;
    function edit(add){
      if(!bars.reportValidity())return;
      // A chord is never shorter than one bar: a timeline without length stops the transport.
      const i=list.selectedIndex,old=chords[i],c={root:+root.value,type:type.value,bars:App.clamp(Math.round(+bars.value)||1,1,16)};
      if(add && chords.length<64){chords.splice(i+1,0,c);draw(i+1);}
      else if(!add && i>=0){chords[i]=old.steps && c.bars===shown ? {...c,bars:old.bars,steps:old.steps} : c;draw(i);}
    }
    function shift(by){const from=list.selectedIndex,to=from+by;if(from>=0 && to>=0 && to<chords.length){const [c]=chords.splice(from,1);chords.splice(to,0,c);draw(to);}}
    const tracks=h("div.pf-follow");
    P.tracks.forEach((T,i)=>{
      const sel=select("Harmony for "+T.name,[["off","Original notes"],["root","Chord root"],["chord","Voice-led chord"]],follow[i],v=>follow[i]=v);
      if(T.kind==="kit" || (T.kind==="smp"&&T.smp.mode===1))sel.disabled=true;
      tracks.append(field(App.pad2(i+1)+" "+T.name,sel));
    });
    body.append(h("h2",{text:"Chord timeline"}),h("div.pf-line",null,h("b",{text:"PROGRESSION"}),total),list,
      h("div.pf-line",null,field("Root",root),field("Quality",type),field("Bars",bars),btn("Insert","Insert a chord after the selected chord",()=>edit(true)),btn("Update","Change the selected chord",()=>edit(false))),
      h("div.pf-line",null,btn("Earlier","Move chord earlier",()=>shift(-1)),btn("Later","Move chord later",()=>shift(1)),btn("Remove","Remove the selected chord",()=>{const i=list.selectedIndex;if(i>=0){chords.splice(i,1);draw(i);}})),
      h("b",{text:"TRACK FOLLOW"}),tracks,status,h("div.dlg-buttons",null,btn("Cancel","Discard changes",()=>node.close()),btn("Apply harmony","Apply timeline and track assignments",()=>{P.harmony={chords,follow};App.commit();node.close();},"confirm-action")));
    node.classList.add("pf-dialog");node.append(body);draw(0);node.showModal();
  }
  App.Harmony={pitches,duration,open,state};
})();
