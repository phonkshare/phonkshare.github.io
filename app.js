// FILE: app.js
import { signInWithPopup } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { collection, addDoc, onSnapshot, orderBy, query, updateDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";
import { doc, getDoc, setDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const feed = document.querySelector("#feed");
const postTpl = document.querySelector("#postTpl");
const form = document.querySelector("#postForm");
const audioEl = document.querySelector("#audio");
const currentTitle = document.querySelector("#currentTitle");
const vizCanvas = document.querySelector("#viz");
const searchEl = document.querySelector("#search");
const loginBtn = document.querySelector("#loginBtn");

// Connexion Google
loginBtn.addEventListener("click", async ()=>{
  try {
    await signInWithPopup(auth, provider);
  } catch(e){ console.error(e); }
});

// Publier un post
form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  if(!auth.currentUser) return alert("Connecte-toi d'abord !");
  const file = document.querySelector("#postAudio").files[0];
  if(!file) return alert("Choisis un fichier audio.");
  const title = document.querySelector("#postTitle").value.trim();
  const text = document.querySelector("#postText").value.trim();

  // upload dans Storage
  const storageRef = ref(storage, "audios/" + Date.now() + "-" + file.name);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  // enregistre dans Firestore
  await addDoc(collection(db, "posts"), {
    author: auth.currentUser.displayName || "@user",
    title, text,
    audioUrl: url,
    likes: 0,
    createdAt: serverTimestamp()
  });

  form.reset();
});

// Écouter Firestore en temps réel
function listenPosts(){
  const q = query(collection(db,"posts"), orderBy("createdAt","desc"));
  onSnapshot(q, snap=>{
    feed.innerHTML = "";
    snap.forEach(docSnap=>{
      const p = {id:docSnap.id, ...docSnap.data()};
      const node = postTpl.content.cloneNode(true);
      node.querySelector(".post-author").textContent = p.author;
      node.querySelector(".post-title").textContent = p.title;
      node.querySelector(".post-text").textContent = p.text;
      node.querySelector(".like-count").textContent = p.likes;
      const audioTag = node.querySelector(".post-audio");
      if(p.audioUrl) audioTag.src = p.audioUrl; else audioTag.remove();

      // Like
      node.querySelector(".like").addEventListener("click", async ()=>{
        const refDoc = doc(db,"posts",p.id);
        await updateDoc(refDoc,{likes:p.likes+1});
      });

      // Jouer dans le mini-player
      if(p.audioUrl){
        audioTag.addEventListener("play", ()=>loadIntoPlayer(p));
      }

      feed.appendChild(node);
    });
  });
}
listenPosts();

// Charger un son dans le mini-player
function loadIntoPlayer(p){
  audioEl.src = p.audioUrl;
  currentTitle.textContent = p.title + " — " + p.author;
  audioEl.play().catch(()=>{});
  connectViz(audioEl);
}

// Visualizer
let audioCtx, analyser, source, rafId;
function connectViz(audio){
  if(rafId) cancelAnimationFrame(rafId);
  if(!audioCtx){ audioCtx = new AudioContext(); analyser = audioCtx.createAnalyser(); analyser.fftSize=256; }
  if(source) try{source.disconnect()}catch{}
  source = audioCtx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);

  const ctx = vizCanvas.getContext("2d");
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw(){
    rafId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);
    ctx.clearRect(0,0,vizCanvas.width,vizCanvas.height);
    const barWidth = vizCanvas.width/bufferLength;
    for(let i=0;i<bufferLength;i++){
      const h = dataArray[i]/255 * vizCanvas.height;
      ctx.fillStyle = "rgba(255,77,139,0.8)";
      ctx.fillRect(i*barWidth,vizCanvas.height-h,barWidth*0.8,h);
    }
  }
  draw();
}
// --- Compteur de visites mensuelles ---
async function updateVisits(){
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const refDoc = doc(db, "stats", "visits");

  const snap = await getDoc(refDoc);
  if(!snap.exists()){
    await setDoc(refDoc, { month: monthKey, count: 1 });
    document.getElementById("visitCount").textContent = "1";
  } else {
    const data = snap.data();
    if(data.month === monthKey){
      await updateDoc(refDoc, { count: increment(1) });
      document.getElementById("visitCount").textContent = data.count + 1;
    } else {
      // Nouveau mois → reset compteur
      await setDoc(refDoc, { month: monthKey, count: 1 });
      document.getElementById("visitCount").textContent = "1";
    }
  }
}
updateVisits();
