import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  onValue
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB7tMeD5fRFNyfJmI44Aa11ydhjfma1vq0",
  authDomain: "esp32ledcontrol-b2562.firebaseapp.com",
  databaseURL: "https://esp32ledcontrol-b2562-default-rtdb.firebaseio.com",
  projectId: "esp32ledcontrol-b2562",
  storageBucket: "esp32ledcontrol-b2562.firebasestorage.app",
  messagingSenderId: "185925528006",
  appId: "1:185925528006:web:873dea6359af852278aac7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getDatabase(app);

const authBox = document.getElementById("authBox");
const controlBox = document.getElementById("controlBox");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authMsg = document.getElementById("authMsg");
const badge = document.getElementById("statusBadge");

const priorityBtn = document.getElementById("priorityBtn");
const priorityStatus = document.getElementById("priorityStatus");
const countdownEl = document.getElementById("countdown");
const prioritySection = document.querySelector(".priority-section");

const gpioButtons = {
  gpio1: document.getElementById("gpio1Btn"),
  gpio2: document.getElementById("gpio2Btn"),
  gpio3: document.getElementById("gpio3Btn")
};

const gpioLabels = {
  gpio1: document.getElementById("gpio1Status"),
  gpio2: document.getElementById("gpio2Status"),
  gpio3: document.getElementById("gpio3Status")
};

// Variables d'état
let priorityMode = false;
let countdownInterval = null;
let blinkInterval = null;
let autoCycleInterval = null;
let currentPhase = 'red'; // 'green', 'orange', 'red'

// Durées du cycle normal (en secondes)
const CYCLE = {
  green: 30,
  orange: 5,
  red: 30
};

// Connexion
loginBtn.onclick = async () => {
  authMsg.textContent = "";
  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("emailField").value,
      document.getElementById("passwordField").value
    );
  } catch (e) {
    authMsg.textContent = e.message;
  }
};

logoutBtn.onclick = () => signOut(auth);

onAuthStateChanged(auth, (user) => {
  if (user) {
    authBox.style.display = "none";
    controlBox.style.display = "block";
    badge.className = "status-badge online";
    badge.textContent = "En ligne";
    startListeners();
    // Démarrer le cycle automatique
    startAutoCycle();
  } else {
    authBox.style.display = "block";
    controlBox.style.display = "none";
    badge.className = "status-badge offline";
    badge.textContent = "Hors ligne";
    stopAllModes();
  }
});

// ========== GESTION DU CYCLE AUTOMATIQUE ==========

function startAutoCycle() {
  if (priorityMode) return;
  
  console.log("Démarrage cycle automatique");
  currentPhase = 'red'; // Commencer par le rouge pour sécurité
  runCyclePhase();
}

function runCyclePhase() {
  if (priorityMode) return;
  
  let duration = CYCLE[currentPhase];
  
  // Envoyer l'état à Firebase
  updateTrafficLight(currentPhase);
  
  // Affichage du temps restant
  let timeLeft = duration;
  updateCountdown(timeLeft);
  
  // Nettoyer l'ancien intervalle
  if (autoCycleInterval) clearInterval(autoCycleInterval);
  
  autoCycleInterval = setInterval(() => {
    if (priorityMode) {
      clearInterval(autoCycleInterval);
      return;
    }
    
    timeLeft--;
    updateCountdown(timeLeft);
    
    if (timeLeft <= 0) {
      // Passer à la phase suivante
      switch(currentPhase) {
        case 'green': currentPhase = 'orange'; break;
        case 'orange': currentPhase = 'red'; break;
        case 'red': currentPhase = 'green'; break;
      }
      runCyclePhase();
    }
  }, 1000);
}

function updateTrafficLight(phase) {
  // gpio1 = Vert, gpio2 = Orange, gpio3 = Rouge
  switch(phase) {
    case 'green':
      set(ref(db, "/gpio1"), 1);
      set(ref(db, "/gpio2"), 0);
      set(ref(db, "/gpio3"), 0);
      updateUI('gpio1', 1);
      updateUI('gpio2', 0);
      updateUI('gpio3', 0);
      break;
    case 'orange':
      set(ref(db, "/gpio1"), 0);
      set(ref(db, "/gpio2"), 1);
      set(ref(db, "/gpio3"), 0);
      updateUI('gpio1', 0);
      updateUI('gpio2', 1);
      updateUI('gpio3', 0);
      break;
    case 'red':
      set(ref(db, "/gpio1"), 0);
      set(ref(db, "/gpio2"), 0);
      set(ref(db, "/gpio3"), 1);
      updateUI('gpio1', 0);
      updateUI('gpio2', 0);
      updateUI('gpio3', 1);
      break;
  }
}

// ========== GESTION DU MODE PRIORITÉ ==========

priorityBtn.onclick = async () => {
  if (!priorityMode) {
    await activatePriorityMode();
  } else {
    await deactivatePriorityMode();
  }
};

async function activatePriorityMode() {
  priorityMode = true;
  
  // Arrêter le cycle automatique
  if (autoCycleInterval) clearInterval(autoCycleInterval);
  
  priorityBtn.classList.add("active");
  priorityBtn.textContent = "🛑 Désactiver Priorité";
  priorityStatus.textContent = "Phase 1: Clignotement Vert+Orange (10s)";
  priorityStatus.classList.add("active");
  prioritySection.classList.add("active");
  
  // Phase 1: Clignotement 10s
  await set(ref(db, "/mode"), "priority_blink");
  startBlinkingSequence(10, async () => {
    // Callback après 10s: Phase verte 60s
    await startPriorityGreenPhase();
  });
}

// Variables pour le modal
let autoReturnInterval = null;
let autoReturnSeconds = 10;
let isModalOpen = false;

async function startPriorityGreenPhase() {
  if (!priorityMode) return;
  
  priorityStatus.textContent = "Phase 2: Vert Prioritaire (60s)";
  
  await set(ref(db, "/mode"), "priority_green");
  await set(ref(db, "/gpio1"), 1);
  await set(ref(db, "/gpio2"), 0);
  await set(ref(db, "/gpio3"), 0);
  
  updateUI('gpio1', 1);
  updateUI('gpio2', 0);
  updateUI('gpio3', 0);
  
  let timeLeft = 60;
  updateCountdown(timeLeft);
  
  countdownInterval = setInterval(async () => {
    if (!priorityMode) return;
    
    timeLeft--;
    updateCountdown(timeLeft);
    
    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      // Ouvrir le modal au lieu de désactiver directement
      openEndPriorityModal();
    }
  }, 1000);
}

// ========== MODAL DE FIN DE PRIORITÉ ==========

function openEndPriorityModal() {
  isModalOpen = true;
  const modal = document.getElementById("endPriorityModal");
  const autoSecondsSpan = document.getElementById("autoSeconds");
  const autoCountdownDiv = document.querySelector(".auto-countdown");
  
  modal.style.display = "flex";
  autoReturnSeconds = 10;
  autoSecondsSpan.textContent = autoReturnSeconds;
  autoCountdownDiv.classList.remove("warning");
  
  // Démarrer le compte à rebours automatique
  autoReturnInterval = setInterval(() => {
    autoReturnSeconds--;
    autoSecondsSpan.textContent = autoReturnSeconds;
    
    if (autoReturnSeconds <= 5) {
      autoCountdownDiv.classList.add("warning");
    }
    
    if (autoReturnSeconds <= 0) {
      clearInterval(autoReturnInterval);
      closeModal();
      deactivatePriorityMode();
    }
  }, 1000);
  
  // Gestionnaires d'événements pour les boutons
  document.getElementById("btnNormal").onclick = () => {
    clearInterval(autoReturnInterval);
    closeModal();
    deactivatePriorityMode();
  };
  
  document.getElementById("btnProlonger").onclick = () => {
    clearInterval(autoReturnInterval);
    closeModal();
    prolongerPriorite();
  };
}

function closeModal() {
  isModalOpen = false;
  document.getElementById("endPriorityModal").style.display = "none";
}

async function prolongerPriorite() {
  // Relancer la phase verte pour 60 secondes supplémentaires
  priorityStatus.textContent = "Phase 2: Vert Prioritaire prolongé (60s)";
  
  await set(ref(db, "/mode"), "priority_green");
  
  let timeLeft = 60;
  updateCountdown(timeLeft);
  
  countdownInterval = setInterval(async () => {
    if (!priorityMode) return;
    
    timeLeft--;
    updateCountdown(timeLeft);
    
    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      // Rouvrir le modal à la fin de la prolongation
      openEndPriorityModal();
    }
  }, 1000);
}

async function deactivatePriorityMode() {
  priorityMode = false;
  isModalOpen = false;
  
  if (countdownInterval) clearInterval(countdownInterval);
  if (autoReturnInterval) clearInterval(autoReturnInterval);
  
  // Phase de transition : Orange pendant 5 secondes avant retour normal
  priorityStatus.textContent = "Transition: Orange (5s)";
  countdownEl.textContent = "⏱️ 5s";
  
  await set(ref(db, "/mode"), "transition_orange");
  await set(ref(db, "/gpio1"), 0); // Vert OFF
  await set(ref(db, "/gpio2"), 1); // Orange ON
  await set(ref(db, "/gpio3"), 0); // Rouge OFF
  
  updateUI('gpio1', 0);
  updateUI('gpio2', 1);
  updateUI('gpio3', 0);
  
  // Attendre 5 secondes
  let transitionTime = 5;
  
  return new Promise((resolve) => {
    const transitionInterval = setInterval(async () => {
      transitionTime--;
      countdownEl.textContent = `⏱️ ${transitionTime}s`;
      
      if (transitionTime <= 0) {
        clearInterval(transitionInterval);
        
        // Maintenant passer au mode normal (Rouge)
        priorityBtn.classList.remove("active");
        priorityBtn.textContent = "🚨 Mode Priorité";
        priorityStatus.textContent = "Mode Normal";
        priorityStatus.classList.remove("active");
        prioritySection.classList.remove("active");
        countdownEl.textContent = "";
        
        await set(ref(db, "/mode"), "normal");
        
        // Reprendre le cycle automatique au rouge
        currentPhase = 'red';
        startAutoCycle();
        resolve();
      }
    }, 1000);
  });
}

// Modification pour permettre l'annulation manuelle pendant la priorité
priorityBtn.onclick = async () => {
  if (!priorityMode) {
    await activatePriorityMode();
  } else {
    // Si le modal est ouvert, ne rien faire (attendre le choix)
    if (isModalOpen) return;
    // Sinon, désactivation manuelle avec confirmation
    if (confirm("Voulez-vous vraiment arrêter la priorité maintenant ?")) {
      clearInterval(countdownInterval);
      clearInterval(autoReturnInterval);
      closeModal();
      await deactivatePriorityMode();
    }
  }
};
function startBlinkingSequence(duration, callback) {
  let timeLeft = duration;
  updateCountdown(timeLeft);
  
  // Clignotement alterné Vert+Orange
  let blinkState = false;
  blinkInterval = setInterval(() => {
    if (!priorityMode) {
      clearInterval(blinkInterval);
      return;
    }
    
    blinkState = !blinkState;
    // Les deux clignotent ensemble
    set(ref(db, "/gpio1"), blinkState ? 1 : 0);
    set(ref(db, "/gpio2"), blinkState ? 1 : 0);
    set(ref(db, "/gpio3"), 0);
    
    updateUI('gpio1', blinkState ? 1 : 0);
    updateUI('gpio2', blinkState ? 1 : 0);
    updateUI('gpio3', 0);
    
  }, 1000); // 500ms = 2Hz
  
  // Compte à rebours
  countdownInterval = setInterval(() => {
    if (!priorityMode) {
      clearInterval(countdownInterval);
      clearInterval(blinkInterval);
      return;
    }
    
    timeLeft--;
    updateCountdown(timeLeft);
    
    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      clearInterval(blinkInterval);
      if (callback) callback();
    }
  }, 1000);
}

function stopAllModes() {
  priorityMode = false;
  if (countdownInterval) clearInterval(countdownInterval);
  if (blinkInterval) clearInterval(blinkInterval);
  if (autoCycleInterval) clearInterval(autoCycleInterval);
}

function updateCountdown(seconds) {
  if (seconds > 0) {
    countdownEl.textContent = `⏱️ ${seconds}s`;
  } else {
    countdownEl.textContent = "";
  }
}

// ========== ÉCOUTEURS ==========

function startListeners() {
  // Écoute des GPIO pour mise à jour UI
  ["gpio1", "gpio2", "gpio3"].forEach((key) => {
    onValue(ref(db, "/" + key), (snapshot) => {
      let value = snapshot.val() ? 1 : 0;
      updateUI(key, value);
    });
  });
  
  // Écoute du mode
  onValue(ref(db, "/mode"), (snapshot) => {
    const mode = snapshot.val();
    // Synchronisation entre clients si nécessaire
  });

  // Boutons manuels (debug)
  Object.values(gpioButtons).forEach((btn) => {
    btn.onclick = async () => {
      if (priorityMode) {
        await deactivatePriorityMode();
      } else {
        // En mode normal, arrêter le cycle et passer en manuel
        if (autoCycleInterval) clearInterval(autoCycleInterval);
      }
      
      let gpio = btn.dataset.gpio;
      let newState = btn.classList.contains("on") ? 0 : 1;
      await set(ref(db, "/" + gpio), newState);
    };
  });
}

function updateUI(key, val) {
  let btn = gpioButtons[key];
  let lab = gpioLabels[key];

  if (val === 1) {
    btn.classList.add("on");
    lab.textContent = "Allumé";
    lab.classList.add("on");
  } else {
    btn.classList.remove("on");
    lab.textContent = "Éteint";
    lab.classList.remove("on");
  }
}