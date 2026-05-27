// app.js (module)
// Use ethers from global window object (loaded via script tag in index.html)
const { ethers } = window.ethers;

/* ===================== CONFIG ===================== */
const contractAddress = "0x7ef8E99980Da5bcEDcF7C10f41E55f759F6A174B"; // your deployed contract address
const contractABI = [
    {
      "inputs": [],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "electionId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "name",
          "type": "string"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "candidateCount",
          "type": "uint256"
        }
      ],
      "name": "ElectionCreated",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "electionId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "bool",
          "name": "active",
          "type": "bool"
        }
      ],
      "name": "ElectionToggled",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "electionId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "candidateId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "address",
          "name": "voter",
          "type": "address"
        }
      ],
      "name": "VoteCast",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "electionId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "address",
          "name": "voter",
          "type": "address"
        }
      ],
      "name": "VoterRegistered",
      "type": "event"
    },
    {
      "inputs": [],
      "name": "admin",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "candidateId",
          "type": "uint256"
        }
      ],
      "name": "castVote",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "name",
          "type": "string"
        },
        {
          "internalType": "uint256",
          "name": "candidateCount",
          "type": "uint256"
        }
      ],
      "name": "createElection",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "electionCount",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        }
      ],
      "name": "getElectionInfo",
      "outputs": [
        {
          "internalType": "bool",
          "name": "active",
          "type": "bool"
        },
        {
          "internalType": "string",
          "name": "name",
          "type": "string"
        },
        {
          "internalType": "uint256",
          "name": "candidateCount",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "candidateId",
          "type": "uint256"
        }
      ],
      "name": "getVotes",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "voter",
          "type": "address"
        }
      ],
      "name": "hasVoted",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "voter",
          "type": "address"
        }
      ],
      "name": "registerVoter",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "bool",
          "name": "active",
          "type": "bool"
        }
      ],
      "name": "toggleElection",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ];
/* ===================== END CONFIG ===================== */

let provider, signer, contract;
let currentAccount = null;
let currentChainId = null;

/* DOM elements */
const connectBtn = document.getElementById("connectBtn");
const networkBadge = document.getElementById("networkBadge");
const accountInfo = document.getElementById("accountInfo");
const welcome = document.getElementById("welcome");
const profileForm = document.getElementById("profileForm");
const profileView = document.getElementById("profileView");
const displayNameInput = document.getElementById("displayName");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const editProfileBtn = document.getElementById("editProfileBtn");
const clearProfileBtn = document.getElementById("clearProfileBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const candidatesDiv = document.getElementById("candidates");
const statusEl = document.getElementById("status");
const messagesEl = document.getElementById("messages");
const electionIdInput = document.getElementById("electionId");
const candidateCountInput = document.getElementById("candidateCount");
const refreshBtn = document.getElementById("refreshBtn");
const greeting = document.getElementById("greeting");

/* Allowed local chain ids (hex) */
const LOCAL_CHAIN_IDS = ["0x7A69", "0x539"];

/* Event listeners */
connectBtn.addEventListener("click", connectWallet);
saveProfileBtn?.addEventListener("click", saveProfile);
editProfileBtn?.addEventListener("click", showProfileEditor);
clearProfileBtn?.addEventListener("click", clearProfile);
disconnectBtn?.addEventListener("click", disconnect);
refreshBtn?.addEventListener("click", safeRenderCandidates);

/* Show message */
function showMessage(text, type = "info") {
  messagesEl.classList.remove("hidden");
  messagesEl.innerText = text;
  messagesEl.style.background = type === "error" ? "#fff1f2" : (type === "warn" ? "#fffbeb" : "#fff7ed");
  messagesEl.style.color = type === "error" ? "#9b1c1c" : (type === "warn" ? "#78350f" : "#92400e");
  setTimeout(() => messagesEl.classList.add("hidden"), 4500);
}

/* Connect wallet */
async function connectWallet() {
  if (!window.ethereum) { showMessage("MetaMask not found", "error"); return; }
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) return showMessage("No accounts returned", "error");

    currentAccount = ethers.utils.getAddress(accounts[0]);
    currentChainId = await window.ethereum.request({ method: "eth_chainId" });

    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    contract = new ethers.Contract(contractAddress, contractABI, signer);

    accountInfo.innerText = currentAccount;
    welcome.innerText = "Connected";
    updateNetworkBadge(currentChainId);
    showProfileOrForm();
    safeRenderCandidates();

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    console.log("Connected:", currentAccount, "chain:", currentChainId);
  } catch (err) {
    console.error("Connection error:", err);
    showMessage("Could not connect — check MetaMask popup or console.", "error");
  }
}

/* Account/chain handlers */
function handleAccountsChanged(accounts) {
  if (!accounts || accounts.length === 0) {
    disconnect();
    return;
  }
  const newAccount = ethers.utils.getAddress(accounts[0]);
  if (newAccount !== currentAccount) {
    currentAccount = newAccount;
    accountInfo.innerText = currentAccount;
    showProfileOrForm();
    safeRenderCandidates();
    showMessage("Account changed. Reloading...", "warn");
    setTimeout(() => location.reload(), 500);
  }
}

function handleChainChanged(chainId) {
  currentChainId = chainId;
  updateNetworkBadge(chainId);
  provider = new ethers.providers.Web3Provider(window.ethereum);
  signer = provider.getSigner();
  contract = new ethers.Contract(contractAddress, contractABI, signer);
  safeRenderCandidates();
}

/* Network badge */
function updateNetworkBadge(chainId) {
  networkBadge.classList.remove("hidden");
  if (LOCAL_CHAIN_IDS.includes(chainId)) {
    networkBadge.innerText = "Local";
    networkBadge.style.background = "#ecfdf5";
    networkBadge.style.color = "#047857";
  } else {
    networkBadge.innerText = `Chain ${parseInt(chainId, 16)}`;
    networkBadge.style.background = "#fff1f2";
    networkBadge.style.color = "#991b1b";
    showMessage("Switch MetaMask to local Hardhat network.", "warn");
  }
}

/* Profile */
function profileKey(addr) { return `voter_profile_${addr.toLowerCase()}`; }

function showProfileOrForm() {
  if (!currentAccount) return;
  const raw = localStorage.getItem(profileKey(currentAccount));
  if (raw) {
    const p = JSON.parse(raw);
    greeting.innerText = `Hello, ${p.name} (${shorten(currentAccount)})`;
    profileView.classList.remove("hidden");
    profileForm.classList.add("hidden");
    welcome.innerText = p.name;
  } else {
    profileForm.classList.remove("hidden");
    profileView.classList.add("hidden");
    welcome.innerText = "Connected";
    displayNameInput.value = "";
  }
}

function saveProfile() {
  const name = displayNameInput.value?.trim();
  if (!name) { showMessage("Enter display name.", "warn"); return; }
  localStorage.setItem(profileKey(currentAccount), JSON.stringify({ name }));
  showProfileOrForm();
  showMessage("Profile saved!");
}

function showProfileEditor() {
  profileForm.classList.remove("hidden");
  profileView.classList.add("hidden");
  const raw = localStorage.getItem(profileKey(currentAccount));
  displayNameInput.value = raw ? JSON.parse(raw).name : "";
}

function clearProfile() {
  localStorage.removeItem(profileKey(currentAccount));
  showProfileOrForm();
  showMessage("Profile cleared.");
}

function disconnect() {
  currentAccount = null;
  accountInfo.innerText = "";
  welcome.innerText = "Not connected";
  profileForm.classList.add("hidden");
  profileView.classList.add("hidden");
  candidatesDiv.innerHTML = "";
  statusEl.innerText = "";
  networkBadge.classList.add("hidden");
  showMessage("Disconnected (UI).", "info");
}

/* Helpers */
function shorten(addr = "") { return addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : ""; }

/* Safe render wrapper */
async function safeRenderCandidates() {
  if (!contract || !currentAccount) { showMessage("Connect wallet first.", "warn"); return; }
  try { await renderCandidates(); } catch (err) { console.error("Render error:", err); showMessage("Failed to load candidates.", "error"); }
}

/* Render candidates */
async function renderCandidates() {
  candidatesDiv.innerHTML = "";
  statusEl.innerText = "Loading candidates...";

  const electionId = Number(electionIdInput.value) || 1;
  const electionInfo = await contract.getElectionInfo(electionId);
  const candidateCount = Number(electionInfo.candidateCount);
  candidateCountInput.value = candidateCount;

  let hasVoted = false;
  try { hasVoted = await contract.hasVoted(electionId, currentAccount); } catch (err) { console.warn(err); }

  for (let i = 1; i <= candidateCount; i++) {
    let votes = "0";
    try { votes = (await contract.getVotes(electionId, i)).toString(); } catch (err) { votes = "N/A"; }

    const card = document.createElement("div");
    card.className = "candidate-card";

    const title = document.createElement("div");
    title.className = "candidate-title";
    title.innerText = `Candidate ${i}`;

    const votesEl = document.createElement("div");
    votesEl.className = "candidate-votes";
    votesEl.innerText = `Votes: ${votes}`;

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";

    const voteBtn = document.createElement("button");
    voteBtn.className = "btn small";
    voteBtn.innerText = hasVoted ? "Already Voted" : "Vote";
    voteBtn.disabled = hasVoted;

    voteBtn.addEventListener("click", async () => {
      if (!contract) { showMessage("Connect wallet first.", "warn"); return; }
      try {
        statusEl.innerText = `Sending vote for Candidate ${i}...`;

        try {
          const regTx = await contract.registerVoter(electionId, currentAccount);
          await regTx.wait();
          console.log("Voter registered:", currentAccount);
        } catch(err) {
          console.log("Already registered or registration failed:", err);
        }

        const tx = await contract.castVote(electionId, i);
        await tx.wait();
        statusEl.innerText = `✅ You voted for Candidate ${i}`;
        showMessage(`You voted for Candidate ${i}`, "info");
        await renderCandidates();
      } catch (err) {
        console.error("Vote error:", err);
        showMessage("Voting failed. See console for details.", "error");
        statusEl.innerText = "Error casting vote.";
      }
    });

    actions.appendChild(voteBtn);
    card.appendChild(title);
    card.appendChild(votesEl);
    card.appendChild(actions);
    candidatesDiv.appendChild(card);
  }

  statusEl.innerText = "Loaded.";
}

/* Startup */
(async function startup() {
  if (!window.ethereum) return;
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (accounts && accounts.length) {
      currentAccount = ethers.utils.getAddress(accounts[0]);
      accountInfo.innerText = currentAccount;
      welcome.innerText = "Connected";
      provider = new ethers.providers.Web3Provider(window.ethereum);
      signer = provider.getSigner();
      contract = new ethers.Contract(contractAddress, contractABI, signer);
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      updateNetworkBadge(chainId);
      showProfileOrForm();
      safeRenderCandidates();
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);
    }
  } catch (err) {
    console.error("Startup error:", err);
  }
})();
