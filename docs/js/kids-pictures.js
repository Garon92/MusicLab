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
    doorbell:path("M20 6h22q3 0 3 3v38q0 3-3 3H20q-3 0-3-3V9q0-3 3-3Z","#dfaa74")+path("M23 12h16v6H23Z",ivory)+
      ellipse(31,33,8,8,"#f2e3c4")+ellipse(31,33,5,5,coral)+path("M28.5 31q1-2 3-2","none",'stroke="#fff1e2" stroke-width="1.6"')+
      path("M50 26q4 4 0 9m5-13q7 8 0 17M12 26q-4 4 0 9M7 22q-7 8 0 17"),
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
    "bike-bell":path("M3 41l56-7 1 6-56 7Z","#95acaa")+path("M46 35.6l13-1.6 1 6-13 1.6Z","#56696d")+
      path("M22 37h16l-2 5H24Z","#70858b")+path("M16 37q0-21 14-21t14 21Z",yellow)+ellipse(30,37,15,3.2,"#d9a84a")+
      ellipse(30,15,2.6,2.6,"#d9a84a")+path("M21 31q0-9 7-11","none",'stroke="#fff2c1" stroke-width="2.6"')+
      path("m44 30 8-7","none",'stroke-width="3"')+ellipse(53.5,21.5,3,3,coral)+path("M9 17q-3 6 0 12M4 14q-5 9 0 18"),
    horn:path("m7 37 7-12 14-2 7-9h11l7 12 5 3 1 10H7Z",coral)+path("m31 23 6-7h7l5 9Z","#cde6df")+
      ellipse(18,39,6,6,"#56696d")+ellipse(47,39,6,6,"#56696d")+ellipse(18,39,2.3,2.3,ivory,false)+ellipse(47,39,2.3,2.3,ivory,false)+
      path("m7 30-5-1m10-5-5-4m9 1-1-5")+path("m9 33 5-1",yellow,'stroke="#f8d57a"'),
    rain:path("M12 31q-8-3-4-11 2-4 9-4 0-8 9-9 9-1 13 6 9-3 13 5 10 1 9 8-1 7-9 7Z","#a8b7d3")+
      path("M15 38q-1 5-4 8m16-8-5 11m18-12-4 9m17-10-5 11",blue,'stroke="#49859d" stroke-width="3.3"')
  };
  // Every pad has its own silhouette; the same picture follows it into the score.
  const puff=(fill)=>path("M12 37q-9-3-5-11 2-5 8-4-1-10 8-10 6-8 14-3 7 0 10 7 9 0 10 7 8 8-1 14-12 5-19 2l-8 8 1-8q-9 2-18-2Z",fill);
  Object.assign(pictures,{
    horse:path("M14 53Q12 34 22 16q10-4 20 4l15 13q3 5-1 8-4 2-8 0l-8-4q-4 6-5 16Z","#c08b64")+
      path("M22 16Q11 24 10 38q0 8 4 15l4-1q-3-12 0-22 2-8 6-12Z","#6f5444")+path("m20 18 2-12 7 10","#c08b64")+
      ellipse(51,37,6.5,4.6,"#e2b08c")+dot(36,24)+dot(54,35,1.2)+path("M48 41q3 1.2 6 0")+path("M27 17q-4 4-1 9",'none','stroke="#6f5444" stroke-width="3"'),
    duck:path("M4 34q10 1 11-3-3-9 7-11 9-2 13 6 3-2 3-7-2-11 9-12 11 0 11 10l-8 7q2 8-3 14-6 9-23 9-17 1-20-13Z",yellow)+path("m52 17 9 2-8 5Z",coral)+path("M17 32q10 12 21-2")+dot(49,14),
    owl:path("M13 16 10 5l13 7q9-3 18 0l13-7-3 14q7 29-17 31-24-1-21-34Z","#a78570")+ellipse(23,24,10,10,ivory)+ellipse(42,24,10,10,ivory)+eyes(24,24,17)+path("m29 28 8 0-4 6Z",yellow)+path("m21 37 3 3 3-3m4 4 3 3 3-3m3-4 2 3 3-4"),
    cricket:path("m7 39 13-14 11 4 12-10 8 3-7 14-16 3Z",green)+path("m15 39 10-15 17 15m-18-8-9 14H6m23-7 4 8h9m-2-13 10 8h6m-8-23q5-12 12-13m-11 14q2-10 4-13")+path("M20 30q5-12 13-12 7-1 9 8Z","#aad6a3")+dot(47,23),
    kettle:path("M19 22q0-17 12-17 11 0 13 17",ivory)+path("m13 24-7-9 7-2 9 11q19-9 25 1l7 15q3 6-4 6H15q-5-3-2-10Z",blue)+path("M20 22h25m-16-4h8m-24 24h38m-41-32q-6-5-2-9"),
    knock:path("M12 48V6h31v42", "#c79971")+path("M17 10h20v15H17Z",peach)+dot(37,34,2)+path("m43 39-4-8q-1-4 3-5 1-4 4-4 2-4 6-2l7 9-1 10-7 5Z",yellow)+path("m41 27 4 4m0-8 4 5m0-8 4 5m-8-14 4 5m4-8v6"),
    siren:path("M13 40h39v6H13Z","#718992")+path("M18 39V28q0-14 14-14t15 14v11Z",coral)+path("M24 29q1-9 7-9",ivory,'stroke="#fff4db" stroke-width="3"')+path("M32 4v5M9 14l5 4m42-5-6 5M5 28l7 1m42-2 6-1"),
    thunder:puff("#94a8c3")+path("m29 29 11-2-6 10h7L23 54l5-14h-6Z",yellow),
    elephant:path("M9 40q-5-6 0-19 4-10 17-12 12-4 20 5 7-1 10 6l1 14q0 7 5 3 1 9-7 9-8-2-9-15l-3 15h-7l-1-11-9 1-2 10h-7l1-12Z","#9daeca")+path("M24 14q-11 11 2 22 10 1 14-14 3-12-7-12Z","#b4c5de")+path("m48 29 5 1-4 5Z",ivory)+dot(48,21),
    monkey:ellipse(11,27,7,8,peach)+ellipse(52,26,7,8,peach)+path("M13 30q-3-13 9-19l-3-5q10 0 13 5 15-7 19 11 6 16-10 23-19 7-28-6Z","#956e51")+path("M17 26q0-10 10-7l6 4q9-10 15-2 5 7-1 11 6 11-13 13-15-1-18-9Z","#f1c39b")+eyes(25,26,15)+path("M22 34q10 11 22-2"),
    tiger:path("m14 18-4-5q-2-7 6-8 5-1 9 7 7-3 15 0 5-8 11-6 8 2 4 10l-5 5q9 20-13 27-16 4-25-10-4-10 2-20Z","#ecaa62")+path("m15 17 6 6-9-2m39-5-9 8 10-4m-25-8 4 8 3-10 3 8 2-7",ink)+ellipse(32,38,12,7,ivory,false)+eyes(22,28,19)+path("m27 33 9-1-3 6Z",peach)+path("m32 38-1 3m-9-6-12-3m13 6-12 1m29-4 13-4m-13 7 12 1"),
    parrot:path("M43 12q12 1 14 12l-8 7-1-8-8-2Z",yellow)+path("M18 33q0-12 9-16-1-12 12-11 12 0 12 12-7 1-8 7-2 12-12 17L9 51l9-15Z",coral)+path("M16 35q9-11 24-13-4 11-15 17L8 47Z",blue)+ellipse(41,14,6,6,ivory,false)+dot(43,14)+path("m28 41-2 6m6-7 1 5"),
    snake:path("M8 42q2-11 16-8 15 5 17 0 2-5-9-8-12-5-7-14 5-9 19-5 8 1 8 7-1 7-9 5l-7-2q-5 2 4 5 19 6 16 16-3 13-24 7-14-6-24-3Z",green)+path("m50 14 8 1 4-3m-4 3 3 4",coral)+dot(44,11)+path("m15 37 4 4 3-4m18-11 3 5 3-4"),
    toucan:path("M10 41q-6-14 5-23 0-10 10-11 10-1 13 10l-3 13q-2 11-14 15l-11 5 4-9Z",ink)+path("M22 17q12-7 13 7 0 11-11 15-6-3-2-9Z",ivory)+path("M29 13q16-6 28 1 7 5 3 16-4-7-18-6l-13-1Z",yellow)+path("m51 13 7 2q6 7 2 14l-5-4Z",coral)+dot(26,14,1.4)+path("m18 43 1 5m7-7 2 5"),
    burp:ellipse(24,32,17,17,"#efbb8b")+path("m14 25 5 2-5 2m20-4-5 2 5 2")+ellipse(24,39,5.5,4.6,ink,false)+ellipse(24,41.5,3,1.6,"#e17b82",false)+
      ellipse(36,33,2.4,2.4,"#cfe3a6")+ellipse(40,27,2,2,"#cfe3a6")+path("M47 22q-6 0-6-5t6-5q1-6 7-6 6 0 7 5 4 1 3 6t-6 5Z","#cfe3a6")+path("M48 15q2-2 4 0t4 0","none",'stroke="#6e8a50" stroke-width="1.8"'),
    fart:path("M29 23.8A13 13 0 1 0 29 44.2A13 13 0 1 0 29 23.8Z","#f2a58b")+path("M29 26q-1 8 0 16")+path("M14 31q2-4 6-4m10 0q2-4 6-4","none",'stroke="#fff1e2" stroke-width="2.2"')+
      path("M48 19q-4 0-4-4t5-4q1-5 6-4 4 1 4 5 4 1 3 5t-5 3Z","#bfda91")+ellipse(48,26,2.4,2.2,"#c7dd9e")+path("M45 33q4 0 6 3m-6 3q3 1 4 3","none",'stroke="#6f8f52"'),
    hiccup:ellipse(29,31,20,17,"#efbb8b")+eyes(22,27,13)+ellipse(30,35,4,5,ink,false)+path("m16 24 6-3m9-.5 6 2m8-6 5-10 1 7 7-1-7 9",yellow),
    sneeze:ellipse(23,30,16,16,"#f3c29b")+path("m12 23 6 2-6 2m22-4-6 2 6 2")+ellipse(23,31,4.4,3.6,"#e8817a")+ellipse(23,39,4,2.6,ink,false)+
      path("M40 27h7m-6 6 7 3m-7-13 6-4","none",'stroke="#5d9fb5"')+ellipse(51,19,2.2,2.2,"#a5d6e4")+ellipse(54,28,2.8,2.8,"#a5d6e4")+ellipse(52,38,2.3,2.3,"#a5d6e4")+ellipse(59,34,1.6,1.6,"#a5d6e4"),
    raspberry:ellipse(31,28,21,19,"#eebe95")+path("m17 23q4-5 9-1m10 0q5-5 9 0m-25 9q11-7 23-1-10 9-23 1Z",ink)+path("M28 31q5-2 9 0l1 9q-1 8-7 6-5-1-4-7Z","#df868a")+path("m33 33 0 7m18-11 7-3m-7 8 8 2"),
    giggle:ellipse(32,28,22,20,yellow)+path("m16 23q5-7 11-1m9-1q6-8 12 0m-28 9q13 8 25-2-1 17-14 15-9-1-11-13Z",ink)+path("M26 37q9-4 13 1-6 6-13-1Z",peach)+path("m6 17 3 3m47 8 5-2"),
    squeak:path("M9 37q4-4 11-3 4-9 12-8-3-12 7-15 12-4 15 8l4 4-7 5q6 10-1 16-10 8-27 3-10-3-14-10Z",yellow)+path("m48 21 13 1-9 6Z",coral)+dot(45,17)+path("M21 35q8 8 17-1")+
      path("M2 46q6-4 12 0t12 0 12 0 12 0 12 0v8H2Z",blue)+ellipse(8,38,2.4,2.4,"#cfeaf2")+ellipse(5,31,1.7,1.7,"#cfeaf2")+path("M57 31l4-2m-3 7 5 1","none",'stroke-width="1.8"'),
    spring:path("M12 44q12-7 35-2l3 5-34 3Z",green)+path("M21 42q22-7 13-11l-14-3q-5-2 19-8t-13-9","none",'stroke-width="3.5"')+ellipse(28,9,10,5,coral)+path("M12 16q1-7 6-9m29 17q5 6 1 12"),
    rattle:path("m28 31 5 4-13 16-7-5Z",yellow)+ellipse(38,20,16,15,coral)+path("m25 12 21 19m-22-12 15 14","#f2c572")+dot(38,13,2)+dot(44,20,2)+path("m10 20 5-6m35-7 5 3"),
    whistle:path("m9 20 24-6 21 5-4 10-11 1q-5 13-18 10-12-5-12-20Z",coral)+path("m20 20 11-3 8 2-9 4Z",ink)+ellipse(22,28,6,6,ivory)+path("m49 12 3-7m1 9 7-3m-5 8 7 2"),
    top:path("M29 4h6v10h-6Z","#a97458")+path("M9 22q23-14 46 0-6 15-23 26-17-11-23-26Z",coral)+path("M14 27q18 5 36 0M20 35q12 4 24 0","none",'stroke="'+ivory+'" stroke-width="3"')+
      path("M32 48v5")+path("M4 30q-3 6 3 9m53-9q3 6-3 9M8 46q24 8 48 0","none",'stroke-width="1.8"'),
    musicbox:path("m7 27 31-6 17 7-31 8Zm0 0 17 9v13L8 40Zm17 9 31-8-1 14-30 7Z","#dfab72")+path("m8 25 1-16 28-5 2 16Z",blue)+path("m16 13 15-3-1 7-13 3Z",ivory)+path("M54 33q10-4 7 3l-4 4m-15-24v-8l8 1v7")+ellipse(39,18,4,2,ink,false)+ellipse(48,17,4,2,ink,false),
    laser:path("m8 22 27-5 13 6-1 6-16 2-4 12-8-1 1-11-12-1Z",blue)+ellipse(43,24,5,6,coral)+path("m48 23 13-4m-12 8 11 1",yellow,'stroke="#bc694d" stroke-width="3"')+path("M15 20q1-5 5-5l10-1 3 4Z",ivory),
    ufo:path("M16 25q2-15 15-15 13 1 16 15Z","#b5dacc")+ellipse(32,29,27,9,blue)+ellipse(32,27,25,5,"#a1c3bd")+dot(16,29)+dot(29,30)+dot(45,28)+path("m22 39-6 8m17-8-1 11m11-13 5 8",yellow,'stroke="#b7904e"'),
    robot:path("M14 17q0-2 4-3l28-1q4 1 4 5v22q-1 4-6 4H19q-5-1-5-5Z",blue)+path("m30 14 1-7m-8 27h18v5H23Z",ivory)+ellipse(32,6,3,3,coral)+ellipse(23,25,4,4,yellow)+ellipse(40,24,4,4,yellow)+path("M8 21h5v12H8Zm43-1h5v13h-5Z","#9eabba"),
    rocket:path("M17 35 8 48l14-6 4-6Z",yellow)+path("m14 27-8 4 1-9 15-7 3 3m4 19 1 10 7-6 2-15",coral)+path("M15 31Q28 8 52 5q-1 23-24 35l-12-4Z",ivory)+path("M41 9q1 7 8 9l3-13Z",coral)+ellipse(33,23,6,6,blue)+path("m8 38-5 4m11 3-5 6"),
    star:path("m32 5 8 15 17 3-12 12 2 16-16-8-14 8 2-17L7 23l17-3Z",yellow)+eyes(27,28,10)+path("M28 34q4 4 8-1m19-23 1 4 4 1-4 1-1 4-1-4-4-1 4-1Z",ivory),
    radar:path("M24 50l7-15 7 15Z","#9eabba")+path("M7 32Q9 13 30 9 26 29 7 32Z","#e4ece8")+path("M12 27q5-9 14-12","none",'stroke="#b8c8c4" stroke-width="1.6"')+
      path("M18 21l14 9")+ellipse(33,30.5,2.6,2.6,coral)+path("M40 14q5 2 6 7m-1-14q9 4 10 14m-3-21q12 6 13 20","none",'stroke="#5f9a63"')
  });
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
    // Outdoors: a tree, the sun behind a cloud and a car on the grass.
    ellipse(47,13,7,7,yellow)+path("M47 2v2.5M58 13h-2.5M55 5l-1.8 1.8M39 5l1.8 1.8")+
    path("M33 23q-6 0-6-5t6-5q2-5 8-4 5-3 9 1 6 0 6 6 0 7-7 7Z",ivory)+path("M2 47q14-7 30-4t30-4v14H2Z",green)+
    path("M12 46V30h5v16Z","#a97458")+path("M6 31q-6-2-4-8 1-5 6-5 0-7 7-8 7 0 8 7 6 1 5 7-1 6-7 7Z","#6fa86b")+
    path("M33 46v-5q0-2 2-2h3l3-5h9l4 5h3q2 0 2 2v5Z",coral)+path("M42.5 35.5h6.5l2.6 3.5H40.5Z","#cde6df")+ellipse(39,47,3.3,3.3,"#56696d")+ellipse(54,47,3.3,3.3,"#56696d")
  ];
  // Each collection has its own cover, not the picture of one of its sounds.
  covers.push(
    // Jungle: two big leaves, bananas on a vine and a monkey peeking out.
    path("M3 53Q0 31 13 19 25 9 34 13q-7 9-7 20 0 11-9 20Z","#5f9a63")+path("M8 45q6-10 15-20M10 34l6 2m-3-9 6 3","none",'stroke="#2f5a3a" stroke-width="1.6"')+
    path("M61 53q3-21-10-33-12-10-21-6 7 9 7 20 0 11 9 19Z","#7fb877")+path("M56 45q-6-10-15-20M54 34l-6 2m3-9-6 3","none",'stroke="#3d6b45" stroke-width="1.6"')+
    path("M28 0q3 6 1 12","none",'stroke="#5f8f4f" stroke-width="2.6"')+path("M26 13q-7 9 0 17 2-1 1-3-4-6 1-13Z",yellow)+path("M30 13q-2 11 6 15 1-2 0-3-4-4-3-11Z",yellow)+
    path("M33 12q4 9 10 9 0-2-1-3-5-1-7-7Z",yellow)+path("m25 13 9-2","none",'stroke="#a97458" stroke-width="3"')+
    ellipse(21,46,4,4.5,peach)+ellipse(43,46,4,4.5,peach)+path("M22 54q-2-16 10-16t10 16Z","#956e51")+path("M25 54q0-10 7-10t7 10Z","#f1c39b")+dot(29,47)+dot(35,47)+path("M30 51q2 1.4 4 0"),
    // Silly: a clown with a red nose and a bow tie.
    path("M14 37q-9 1-11-6 0-7 6-7-3-7 4-9 6-1 7 5Z",coral)+path("M50 37q9 1 11-6 0-7-6-7 3-7-4-9-6-1-7 5Z",coral)+
    path("M24 15 32 1l8 14Z",blue)+ellipse(32,2,2.6,2.6,yellow)+ellipse(32,30,17,17,ivory)+
    path("M21 25q3-4 6 0m10 0q3-4 6 0")+ellipse(20,33,3,2,peach,false)+ellipse(44,33,3,2,peach,false)+
    path("M21 36q11 13 22 0-11 4-22 0Z","#e05d55")+ellipse(32,31,4.6,4.6,"#e8524a")+path("M22 46l10 4 10-4v8l-10-4-10 4Z",yellow)+ellipse(32,50,2.2,2.2,coral),
    // Toys: a teddy bear with a bow.
    ellipse(17,12,6,6,"#c08b64")+ellipse(47,12,6,6,"#c08b64")+ellipse(17,12,3,3,"#e8b578",false)+ellipse(47,12,3,3,"#e8b578",false)+
    ellipse(15,40,5,7.5,"#c08b64")+ellipse(49,40,5,7.5,"#c08b64")+ellipse(32,41,15,12,"#c08b64")+ellipse(32,43,8,7,"#e8b578",false)+
    ellipse(22,51,6.5,4.5,"#c08b64")+ellipse(42,51,6.5,4.5,"#c08b64")+ellipse(22,51.5,3,2.2,"#e8b578",false)+ellipse(42,51.5,3,2.2,"#e8b578",false)+
    ellipse(32,21,15,13,"#c08b64")+ellipse(32,26,6.5,5,"#e8b578")+ellipse(32,24,2.6,1.9,ink,false)+path("M32 26v2m-3 1q3 2 6 0")+dot(26,19)+dot(38,19)+
    path("M25 33l7 3 7-3v7l-7-3-7 3Z",coral),
    // Space: a ringed planet, a moon and stars.
    path("M8 6l1.4 3.4 3.4 1.4-3.4 1.4L8 15.6l-1.4-3.4-3.4-1.4 3.4-1.4Z",yellow)+path("M55 40l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8-2.8-1.2 2.8-1.2Z",yellow)+dot(50,8,1.5)+dot(21,51,1.3)+dot(58,15,1.2)+
    path("M5.8 35.5A27 7 -14 0 1 58.2 22.5","none",'stroke-width="6.4"')+path("M5.8 35.5A27 7 -14 0 1 58.2 22.5","none",'stroke="'+yellow+'" stroke-width="3.2"')+
    ellipse(32,29,15,15,"#b0b5e9")+path("M18.5 24q13.5 4 27 0M17.5 32q14.5 4 29 0","none",'stroke="#8b90cf" stroke-width="1.8"')+
    path("M5.8 35.5A27 7 -14 0 0 58.2 22.5","none",'stroke-width="6.4"')+path("M5.8 35.5A27 7 -14 0 0 58.2 22.5","none",'stroke="'+yellow+'" stroke-width="3.2"')+
    ellipse(12,47,4.2,4.2,ivory)+path("M10 45.5q1-1.5 2.6-1.4","none",'stroke-width="1.4"')
  );
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
  // A merry-go-round for the effect that turns the sound around the room.
  effects.spin=path("M5 15 29 3l24 12Z",coral)+path("M17 15 29 3l-4 12m4-12 4 12m-4-12 12 12","none",'stroke="'+ivory+'" stroke-width="2.4"')+path("M5 15h48")+
    path("M11 15v18m18-18v18m18-18v18")+ellipse(29,34,22,4,"#cfb38c")+ellipse(11,25,3.6,3,yellow)+ellipse(29,22,3.6,3,blue)+ellipse(47,26,3.6,3,green)+
    path("M1 21q-2 6 1 10m54-10q2 6-1 10","none",'stroke-width="1.8"');
  const ground={
    echo:ellipse(72,36,20,7,"#9bc8c1")+ellipse(72,36,12,3.5,"none")+path("m66 35 3-5 6-1 5 6Z","#abc3ac"),
    colour:path("M64 37q2-6 8-6 7 0 10 7l-4 2H65Z","#cea383")+ellipse(86,40,4,2,"#d5ad8d")+
      path("M9 38q-3-6-7-7 6 0 8 3 2-8 5-9 0 8-2 13Z","#aabd8b"),
    spin:ellipse(76,40,16,4,"#e6b9c4")+path("M68 34l3-7 3 7m6 1 3-6 3 6","none",'stroke="#9c6b7a"'),
    motion:path("m8 37 45-3 10 4-50 3Z","#cfb38c")+path("m15 41 1 3 39-3v-2","#bc996e")+
      path("m70 37-3-5m4 5 2-9 3 8 4-5m5 10h5","none",'stroke="#79877b"')
  };
  function effect(name,landscape=false){
    const body=landscape?'<g stroke-width="1.4">'+ground[name]+'</g><g transform="translate(4 0)">'+effects[name]+'</g>':effects[name];
    return '<svg class="kv-effect-picture" viewBox="'+(landscape?"0 0 96 48":"0 0 58 40")+'" fill="none" stroke="'+ink+'" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+body+'</svg>';
  }
  App.KidsPictures={sound:id=>group(pictures[id]||""),cover:index=>group(covers[index]||""),tempo,effect};
})();
