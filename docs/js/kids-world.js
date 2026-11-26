/* Packaged one-shots use ordinary kit pads. Their stable IDs can be restored from the
   installed audio library, and a portable project carries the actual WAV bytes.
   Give a replacement recording a new ID so saved compositions keep their timbre. */
(() => {
  "use strict";
  const makeGroup = (id,name,items) => ({id,name,sounds:items.map(([id,name]) => ({
    id,name,sampleId:"mlband01"+id.replaceAll("-","")
  }))});
  const groups = [
    makeGroup("farm","Farm",[["cow","Cow"],["pig","Pig"],["sheep","Sheep"],["rooster","Rooster"]]),
    makeGroup("wild","Animals",[["dog","Dog"],["cat","Cat"],["bird","Bird"],["frog","Frog"]]),
    makeGroup("home","Home",[["doorbell","Doorbell"],["clock","Clock"],["keys","Keys"],["glass","Glass"]]),
    makeGroup("travel","Outdoors",[["train","Train"],["bike-bell","Bike bell"],["horn","Car horn"],["rain","Rain"]])
  ];
  const assets = new Map(groups.flatMap(g => g.sounds.map(s => [
    s.sampleId,{name:s.name,url:"./audio/kids/"+s.id+".wav"}
  ])));
  App.extendProject({bundledSample:id => assets.get(id)});

  function install(track,group) {
    track.kind="kit";track.name=group.name.toUpperCase();track.lo=36;
    track.vol=.83;track.rev=.035;track.dly=0;
    group.sounds.forEach((sound,row) => {
      Object.assign(track.kit.pads[row],{name:sound.name.toUpperCase().slice(0,8),src:1,
        id:sound.sampleId,lvl:.9,dec:4,chk:0,st:0,en:1,pit:0,pan:0});
    });
  }
  async function ready(P) {
    const ids=Array.from(App.sampleIds(P)).filter(id=>assets.has(id));
    await Promise.all(ids.map(id=>App.restoreSample(id)));
  }
  App.KidsWorld={groups,install,ready};
})();
