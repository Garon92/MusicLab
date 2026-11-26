/* The collection tabs, row keys and notes share these original cut-paper drawings. */
(() => {
  "use strict";
  const ink="#293a40",ivory="#fff4d5",peach="#f2a58b",blue="#72b6c5",yellow="#f4c65c",green="#87ba82",coral="#e78469";
  const path=(d,fill="none",extra="")=>'<path d="'+d+'" fill="'+fill+'" '+extra+'/>';
  const ellipse=(cx,cy,rx,ry,fill,outline=true)=>'<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+rx+'" ry="'+ry+'" fill="'+fill+'"'+(outline?'':' stroke="none"')+'/>';
  const dot=(x,y,r=1.7)=>ellipse(x,y,r,r,ink,false);
  const eyes=(x,y,dx)=>dot(x,y)+dot(x+dx,y);
  const face=(x,y,w,h,fill)=>ellipse(x,y,w,h,fill);
  const group=(body)=>'<svg class="kv-picture" viewBox="0 0 64 56" fill="none" stroke="'+ink+'" stroke-width="2.15" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true" focusable="false">'+body+'</svg>';
  const pictures={
    cow:path("M19 17Q11 13 13 6q3 6 11 6m16 0q8 0 11-6 1 9-6 12",yellow)+
      path("M20 19Q11 13 4 17q2 11 17 8m23-6q10-6 16-2-2 11-17 8",ivory)+
      path("M17 21q2-11 15-11 13-1 16 10l-1 14q0 13-15 14-15 0-15-13Z",ivory)+
      path("M18 21q2-9 12-10 4 7 1 11-4 6-12 6",ink,'stroke="none"')+ellipse(31.8,39,15.4,8.3,peach)+
      ellipse(24.4,23,1.8,2,ivory,false)+dot(39,23)+ellipse(26,38,1.6,2,ink,false)+ellipse(38,38,1.6,2,ink,false),
    pig:path("M18 23Q8 14 9 5q9 1 15 9m17 2q8-10 15-9 1 11-10 17",peach)+
      path("M15 25q1-13 16-14 17-1 20 16 2 16-18 20-19 0-18-14Z","#ef9a97")+
      path("m13 11 5 6m32-4-4 5","#f7c1a4")+eyes(23,26,17)+ellipse(32,36,11,7.5,"#e17b82")+eyes(28,36,8)+
      path("M16 32q-2 2-4 0m39-2q3 2 5 0"),
    sheep:path("M18 26q-10-4-12 3 2 7 14 5m24-8q11-4 14 2-1 8-13 6","#a17d69")+
      path("M13 23q-4-7 3-11 0-7 9-7 7-5 12 0 9-2 12 6 8 2 6 9 6 7-1 13 1 8-8 10-7 7-14 3-8 5-14-2-9 0-11-9-7-6 0-12Z",ivory)+
      path("M19 27q1-9 13-10 13 0 15 10-1 13-14 17-12-3-14-17Z","#a88874")+
      path("M16 21q-1-7 7-8 3-6 10-3 7-3 11 4 7 1 6 7-4 4-10 0-6 5-12 1-7 4-12-1Z",ivory)+
      eyes(25,29,15)+path("m29 34 4 2 3-3",ink),
    rooster:path("M30 23q-2-8 2-12l3 4q0-10 4-11 3 2 3 8 5-8 8-5 2 7-5 13",coral)+
      path("M24 31Q9 12 8 19q-1 5 7 12Q4 25 3 29q2 10 17 12",blue)+
      path("M18 35q1-9 12-12 1-10 12-9 10 1 10 11 0 7-9 12-6 11-16 10-10 0-9-12Z",yellow)+
      path("m50 22 11 4-11 5Z","#ed9855")+path("M47 31q4-3 5 1 2 5-2 6-4 0-3-7Z",coral)+
      path("M20 34q3 11 15 0m-8 12-1 5-5 1m15-6 1 5h5")+dot(44,22),
    dog:path("M21 13Q10 6 5 21q-3 9 1 14 5 3 14-9m23-13q12-7 16 8 3 7 0 11-5 5-16-7","#a97458")+
      path("M16 19q5-10 17-10 15-1 18 13l-2 12q-3 13-18 13-15-1-15-13Z","#e8b578")+
      path("M37 12q12 0 12 12-5 8-12 4-4-6 0-16Z","#bf865e",'stroke="none"')+
      ellipse(32,36,12,8.5,ivory,false)+eyes(24,24,16)+path("M27 31q5-4 10 0l-5 5Z",ink)+
      path("M32 36v3m-7-1q3 5 7 1 5 4 8-1")+path("M34 41q4 1 7-1 0 7-4 7-3-1-3-6Z",peach),
    cat:path("M13 30 12 7q1-3 4 0l13 10q5-2 10 0L51 6q2-2 2 2l-1 22q1 14-20 17-19-1-19-17Z","#dfaa70")+
      path("m16 12 8 7-7 2Zm33 0-7 8 6 1Z",peach)+
      path("m26 17 3 6 3-6 3 6 3-6","#a77952",'stroke="none"')+eyes(23,28,17)+
      path("m29 33 4-1 3 1-3 3Z",peach)+path("M33 36q-1 5-6 3m6-3q1 5 6 3M17 31 5 28m13 7L5 36m42-5 12-4m-12 8 12 1"),
    bird:path("M10 38q-6-5-6-15l12 6q4-17 17-19 12-3 18 7 5 9 0 16-6 13-24 11-9-1-17-6Z",blue)+
      path("m50 19 12 4-12 6Z",yellow)+path("M16 29q8-7 18-6-1 11-13 14Z","#5b95ad")+
      path("m27 44-2 7-4 1m15-8 1 6 5 1")+dot(43,20)+
      path("M26 11q2-5 6-7m1 6q4-4 7-4"),
    frog:path("M11 30q-5-8 0-15 7-7 14 0 8-4 15 0 7-7 14-1 5 6 0 15 5 11-8 16-16 7-31-1-9-5-4-14Z",green)+
      face(18,18,7,6.5,ivory)+face(46,18,7,6.5,ivory)+eyes(19,18,26)+
      path("M13 33q18 13 38-1")+dot(28,28,1.15)+dot(36,28,1.15)+
      ellipse(16,32,3.8,2,"#dec584",false)+ellipse(48,31,3.8,2,"#dec584",false),
    doorbell:path("M15 49V8q0-3 3-3h25q3 0 3 3v41Z","#dfaa74")+path("M20 47V11h20v36Z","#b6ced3")+
      path("M25 16h10v13H25Z",ivory)+dot(35.5,34,1.8)+
      path("M48 24q1-2 3-2h4q2 0 2 2v12h-9Z",yellow)+ellipse(52.5,30.5,2.1,2.1,coral)+
      path("M47 15q5-1 7 2m-5-7q8-1 11 5")+path("M10 50h44"),
    clock:path("m17 42-3 8m33-8 3 8m-20-40h5")+path("M11 18q-5-7 1-11 7-5 13 2Zm28-9q5-6 12-2 6 3 3 10Z",coral)+
      ellipse(32,28,19,18,blue)+ellipse(32,28,15,14,ivory)+path("M32 17v11l8 4m-8 8v-2m-12-10h2m22 0h-2")+dot(32,28,2.3),
    keys:path("M25 22q-11-7-7-14 4-7 16-3 8 4 8 13",blue)+
      path("m27 20 4 6-12 22-8 1-1-6 4-3-1-4 5-1 4-8-3-4q-1-4 4-6Z",yellow)+
      path("M36 16q9-4 14 2 3 5-2 10l2 16-5 4-5-4 1-3-4-2 2-3-1-9q-7-2-6-7Z","#d0c8aa")+
      ellipse(41,21,3.2,3,ivory)+path("M22 15q2-7 8-5"),
    glass:path("m13 13 6 33q0 4 5 4h15q4 0 4-4l6-33Z","#d7efdf")+
      ellipse(31,13,18,5.5,ivory)+path("m18 29q12 4 26-1l-3 16q0 3-4 3H25q-4 0-4-3Z",blue,'stroke="none"')+
      path("m21 21 2 10","#fff",'stroke="#fff"')+path("m48 6 3-4m0 10 7-2m-6 8 6 2"),
    train:path("M7 39h49v6H7Z",coral)+path("M9 22h25q4 0 5 4v12H9Z",blue)+path("M15 21v-9h8v9m-11-9h14v-3H12Z",ink)+
      path("M34 18h19v21H34Z",yellow)+path("m31 17 3-6h20l3 6Z",coral)+path("M39 21h8v9h-8Z","#cbe7dc")+
      path("m8 34-6 11h8Z",yellow)+ellipse(16,43,5,5,"#70858b")+ellipse(30,43,5,5,"#70858b")+ellipse(44,43,5,5,"#70858b")+
      path("m4 51 54-1")+path("M19 7q6-5 10-2t11-2",ivory,'stroke-width="1.4"'),
    "bike-bell":path("m5 43 12-7 30-8 11 4-1 5-9-3-27 8-12 6Z","#95acaa")+
      path("M16 34q-1-16 13-20 13-4 20 10l1 4Z",yellow)+path("M14 35q18-2 38-9l1 4q-17 7-37 9Z","#c78d55")+
      path("m30 14-1-4 6-2 2 4")+path("M21 27q3-7 9-8",ivory,'stroke="#fff2c1"')+
      path("m48 14 5-5m-2 11 7-1m-15-9 1-5"),
    horn:path("m7 37 7-12 14-2 7-9h11l7 12 5 3 1 10H7Z",coral)+path("m31 23 6-7h7l5 9Z","#cde6df")+
      ellipse(18,39,6,6,"#56696d")+ellipse(47,39,6,6,"#56696d")+ellipse(18,39,2.3,2.3,ivory,false)+ellipse(47,39,2.3,2.3,ivory,false)+
      path("m7 30-5-1m10-5-5-4m9 1-1-5")+path("m9 33 5-1",yellow,'stroke="#f8d57a"'),
    rain:path("M12 31q-8-3-4-11 2-4 9-4 0-8 9-9 9-1 13 6 9-3 13 5 10 1 9 8-1 7-9 7Z","#a8b7d3")+
      path("M15 38q-1 5-4 8m16-8-5 11m18-12-4 9m17-10-5 11",blue,'stroke="#49859d" stroke-width="3.3"')
  };
  const covers=[
    path("M5 46h53",green)+path("M10 44V23l18-13 17 12v22Z",coral)+path("m7 23 8-11L28 5l14 9 7 10-5 1-5-8-11-7-10 6-7 10Z",ivory)+
    path("M19 27h18v17H19Z","#f5d7aa")+path("m20 28 16 15m0-15L20 43m28 0V23q1-8 7-8t7 8v20Z",yellow)+path("M49 25h12m-12 6h13"),
    path("M9 29Q5 17 7 11q6 0 14 8l10-1q9-11 12-9l1 19q4 10-9 16-16 7-27-2-5-6 1-13Z","#e4b479")+
    path("m11 15 6 6-6 1Zm28-1-4 7 6-2Z",peach)+eyes(16,30,13)+path("m18 35 3-1 3 1-3 3Z",peach)+path("M12 35 4 33m9 5-8 2")+
    path("M33 28q10-10 18-3 11 7 6 17-4 8-14 8-12 0-15-8-3-8 5-14Z",ivory)+
    path("M35 26q-4-7-9 4-4 9 0 13 7-4 9-17Zm18 1q1-6 6 1 7 9 2 14-5-3-8-15Z","#a97d68")+eyes(37,34,13)+
    path("m39 39 4-1 4 1-4 4Z",ink)+path("M43 43q1 3 4 2"),
    path("M10 45V25l20-16 22 16v21Z",yellow)+path("M7 25 30 5l26 19-4 4L30 13l-19 16Z",coral)+
    path("M16 28h10v10H16Z",blue)+path("M33 27h12v19H33Z","#a98670")+dot(41,37,1)+path("M7 48h48"),
    path("M4 44q13-12 23-12l2-10q12 5 29 3v20H4Z","#c4d0b7")+
    path("M6 33h40l6 7H6Z",blue)+path("M9 32V17h31q5 0 11 13l-2 3Z",coral)+path("M13 20h8v8h-8Zm12 0h9v8h-9Zm13 0 6 1 4 7H38Z","#cce7e1")+
    ellipse(16,40,4,4,ink)+ellipse(42,40,4,4,ink)+path("m4 48 54-2")
  ];
  // A wide view keeps the side profiles readable inside the tempo thumb.
  const speeds=[
    path("M3 30q8 0 14-9l14 2 5-8q2-4 6-1 5 2 4 7-1 7-10 10H6Z","#b8ca86")+
    path("m38 16-1-7m7 7 2-7")+dot(37,8)+dot(46,8)+
    ellipse(21,21,11,10,"#f1ae76")+path("M15 23q-2-7 5-8 7-1 7 5 0 5-5 5-4 0-4-4 0-2 3-2"),
    path("m4 23 6 1 4-5 17 1 4-5q2-6 8-5 6 1 6 6 0 6-10 7l-7 6-3 3h-4l1-5-9-1-4 6H9l2-7Z","#98c981")+
    path("M6 23C7 14 12 7 20 7c9 0 14 7 15 15l-2 2H8Z","#64a579")+
    path("m11 13 7 2 7-3 5 2m-12 1-2 7m9-10 2 10","none",'stroke-width="1.6"')+
    path("M7 23q12 3 27-1",ivory)+dot(44,14,1.4),
    ellipse(8,23,4.2,4.4,ivory)+
    path("M12 25q-2-8 4-13 7-5 14 0l3-2q-5-9-2-10 4-1 9 10l1-7q1-3 3-2 2 2 0 10 5 2 5 7-1 5-10 5l-5 6 6 2q2 2-1 3l-12-2-5 1-15-2 3-3Z",ivory)+
    path("m32 4 5 7","none",'stroke="#da997e" stroke-width="2"')+path("M16 22q6-7 10 0 2 5-6 6")+dot(43,15,1.4),
    path("m11 24-5 8 9-3 4-6Z",yellow)+path("m17 19-8 3-2-3 8-8 9-1m1 16-1 6-3 2-2-8",coral)+
    path("M13 21Q24 4 46 3q-1 17-21 24l-9-2Z",ivory)+path("M35 5q2 6 7 7 4-5 4-9Z",coral)+
    ellipse(30,15,4.1,4.1,blue)+path("m7 15-5 3m11 13-4 3","none",'stroke="#a37b40"')
  ];
  function tempo(index){
    return '<svg viewBox="0 0 52 36" fill="none" stroke="'+ink+'" stroke-width="2.05" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+speeds[index]+'</svg>';
  }
  const effects={
    echo:path("M3 35 8 19l8-10 13-4 10 5 6 13 2 12Z","#d9ac78")+
      path("m8 20 8-2 4-8 9-4m10 6-6 3","none",'stroke="#97724f" stroke-width="1.8"')+
      path("M13 35q1-14 9-18 5-4 10 0 6 6 7 18Z","#476775")+
      path("M23 22q6 3 3 9","none",'stroke="'+ivory+'" stroke-width="2.7"')+
      path("M34 19q8 5 4 14m6-17q10 7 5 20","none",'stroke="#395557" stroke-width="4.7"')+
      path("M34 19q8 5 4 14m6-17q10 7 5 20","none",'stroke="#cde6db" stroke-width="1.8"'),
    colour:path("M9 29 5 24l4-2-4-9 8 1 1-10 8 6 4-9 5 10 8-6-1 9 6-1-3 13-8 7-17 1Z","#cc825b")+
      path("m13 15 3 4 3-7m3 11 4-8 3 4","none",'stroke="#84583f" stroke-width="2"')+
      path("M30 17q5-4 10 0l8 6 7 2q-1 8-16 10-14 3-24-2l-4-4q13 0 19-12Z","#f5c99a")+
      path("m19 34-1 3h6m10-3v3h5")+ellipse(54,25,2.6,2.3,ink,false)+dot(40,21,1.7),
    motion:path("M12 33q14-4 27 0l-2 4H14Z","#89b7aa")+
      path("M24 31q15-3 8-6l-14-2q-5-2 10-5l8-2","none",'stroke-width="3.2"')+
      path("m21 17 5-5 10 4-3 5Z",yellow)+
      ellipse(31,10,8.3,7.7,coral)+path("M27 8q1-3 4-3","none",'stroke="'+ivory+'" stroke-width="2"')+
      path("M19 7q-3 2-4 7m0-11q-6 4-7 10m36-1q2 3 1 6m3-10q5 6 3 12","none",'stroke-width="2.2"')
  };
  const ground={
    echo:ellipse(72,36,20,7,"#9bc8c1")+ellipse(72,36,12,3.5,"none")+path("m66 35 3-5 6-1 5 6Z","#abc3ac"),
    colour:path("M64 37q2-6 8-6 7 0 10 7l-4 2H65Z","#cea383")+ellipse(86,40,4,2,"#d5ad8d")+
      path("M9 38q-3-6-7-7 6 0 8 3 2-8 5-9 0 8-2 13Z","#aabd8b"),
    motion:path("m8 37 45-3 10 4-50 3Z","#cfb38c")+path("m15 41 1 3 39-3v-2","#bc996e")+
      path("m70 37-3-5m4 5 2-9 3 8 4-5m5 10h5","none",'stroke="#79877b"')
  };
  function effect(name,landscape=false){
    const body=landscape?'<g stroke-width="1.4">'+ground[name]+'</g><g transform="translate(4 0)">'+effects[name]+'</g>':effects[name];
    return '<svg class="kv-effect-picture" viewBox="'+(landscape?"0 0 96 48":"0 0 58 40")+'" fill="none" stroke="'+ink+'" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+body+'</svg>';
  }
  App.KidsPictures={sound:id=>group(pictures[id]||""),cover:index=>group(covers[index]||""),tempo,effect};
})();
