/* Each pictured one-shot has a stable sample ID and an ordinary editable kit pad.
   Keep the first eight pad assignments intact when upgrading an existing kit. */
(() => {
  "use strict";
  const makeGroup=(id,name,label,items)=>({id,name,label,sounds:items.map(([id,name,label])=>({
    id,name,label,sampleId:"mlband01"+id.replaceAll("-","")
  }))});
  const groups=[
    makeGroup("farm","Farm","Farma",[["cow","Cow","Kráva"],["pig","Pig","Prase"],["sheep","Sheep","Ovce"],["rooster","Rooster","Kohout"],["horse","Horse","Kůň"],["duck","Duck","Kachna"]]),
    makeGroup("wild","Animals","Zvířata",[["dog","Dog","Pes"],["cat","Cat","Kočka"],["bird","Bird","Pták"],["frog","Frog","Žába"],["owl","Owl","Sova"],["cricket","Cricket","Cvrček"]]),
    makeGroup("home","Home","Doma",[["doorbell","Doorbell","Zvonek"],["clock","Clock","Hodiny"],["keys","Keys","Klíče"],["glass","Glass","Sklenička"],["kettle","Kettle","Konvice"],["knock","Knock","Klepání"]]),
    makeGroup("travel","Outdoors","Venku",[["train","Train","Vlak"],["bike-bell","Bike bell","Zvonek kola"],["horn","Car horn","Klakson"],["rain","Rain","Déšť"],["siren","Siren","Siréna"],["thunder","Thunder","Hrom"]]),
    makeGroup("jungle","Jungle","Džungle",[["elephant","Elephant","Slon"],["monkey","Monkey","Opice"],["tiger","Tiger","Tygr"],["parrot","Parrot","Papoušek"],["snake","Snake","Had"],["toucan","Toucan","Tukan"]]),
    makeGroup("silly","Silly","Legrace",[["burp","Burp","Krknutí"],["fart","Fart","Prdík"],["hiccup","Hiccup","Škyt"],["sneeze","Sneeze","Kýchnutí"],["raspberry","Raspberry","Prsknutí"],["giggle","Giggle","Chichot"]]),
    makeGroup("toys","Toys","Hračky",[["squeak","Squeaker","Kačenka"],["spring","Spring","Pružina"],["rattle","Rattle","Chrastítko"],["whistle","Whistle","Píšťalka"],["top","Spinning top","Káča"],["musicbox","Music box","Hrací skříňka"]]),
    makeGroup("space","Space","Vesmír",[["laser","Laser","Laser"],["ufo","Flying saucer","UFO"],["robot","Robot","Robot"],["rocket","Rocket","Raketa"],["star","Star","Hvězda"],["radar","Radar","Radar"]])
  ];
  // Raise SOUNDS whenever the audio of these files changes: a browser that kept the older copy fetches the new one
  // once, and without a connection it keeps playing what it has.
  const SOUNDS=2;
  const assets=new Map(groups.flatMap(g=>g.sounds.map(s=>[s.sampleId,{name:s.name,url:"./audio/kids/"+s.id+".wav?v="+SOUNDS,version:SOUNDS}])));
  App.extendProject({bundledSample:id=>assets.get(id)});
  const padIndex=(group,row)=>group>=4?10+row:row<4?row:4+row;
  function install(track,index,extendOnly=false){
    const group=groups[index];
    if(!extendOnly){
      track.kind="kit";track.name=group.name.toUpperCase();track.lo=36;
      track.vol=.83;track.rev=.035;track.dly=0;
    }
    const pads=track.kit.pads;
    const stock=App.newKit(16).pads;
    while(pads.length<16)pads.push(stock[pads.length]);
    // The original world always assigned four samples. Upgrading keeps all
    // eight old pad definitions, including user replacements on pads 5–8.
    group.sounds.forEach((sound,row)=>{
      const k=padIndex(index,row);
      if(extendOnly && k<8)return;
      Object.assign(pads[k],{name:sound.name.toUpperCase().slice(0,8),src:1,id:sound.sampleId,lvl:.9,dec:4,chk:0,st:0,en:1,pit:0,pan:0});
    });
  }
  async function ready(P){
    const ids=Array.from(App.sampleIds(P)).filter(id=>assets.has(id));
    await Promise.all(ids.map(id=>App.restoreSample(id)));
  }
  App.KidsWorld={groups,install,padIndex,ready};
})();
