// js/firebase-init.js
// Inicializa o Firebase com as configurações do projeto

const firebaseConfig = {
  apiKey: "AIzaSyDo9d-PLgQAYmlTBsRqxv_VcrIYE4B5XAo",
  authDomain: "retrabalho-stc.firebaseapp.com",
  projectId: "retrabalho-stc",
  storageBucket: "retrabalho-stc.firebasestorage.app",
  messagingSenderId: "674067995306",
  appId: "1:674067995306:web:5eccb99a0206ee9e20ced3"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
