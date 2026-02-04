// ====================
// SUPABASE CONFIG
// ====================
const supabaseUrl = 'https://ynznnuogfedbvxoojcdp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inluem5udW9nZmVkYnZ4b29qY2RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNTA0MTcsImV4cCI6MjA4NTcyNjQxN30._RhkU6Fg-VR0eMFDYTF-LVnLgqRDuuFOr0xhsACSczs';
const supabase = window.supabase.createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  }
);


// ====================
// CARREGAR DADOS
// ====================
let data;
fetch('data.json')
    .then(response => response.json())
    .then(json => {
        data = json;
        checkAuthAndInit();
    })
    .catch(error => console.error('Erro ao carregar dados:', error));

// ====================
// AUTENTICAÇÃO
// ====================
async function login(email, password) {
    console.log('Tentando login...');
    // Tentar login primeiro
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (!loginError) {
        console.log('Login bem-sucedido:', loginData);
        document.getElementById('auth-message').textContent = 'Login bem-sucedido!';
        return;
    }

    console.log('Login falhou, tentando sign-up:', loginError.message);
    // Se login falhar, tentar sign-up
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
        console.error('Erro no sign-up:', signUpError);
        document.getElementById('auth-message').textContent = 'Erro: ' + signUpError.message;
    } else {
        console.log('Sign-up bem-sucedido:', signUpData);
        document.getElementById('auth-message').textContent = 'Conta criada! Verifique seu email para confirmar.';
    }
}

async function logout() {
    console.log('Fazendo logout...');
    await supabase.auth.signOut();
    location.reload();
}

async function checkAuthAndInit() {
    const { data: { user }, error } = await supabase.auth.getUser();
    console.log('Estado de auth:', user ? 'Logado' : 'Não logado', error);
    if (user) {
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
        document.getElementById('logout-btn').style.display = 'inline';
        init();
    } else {
        document.getElementById('auth-section').style.display = 'block';
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'none';
    }
}

// Listener para mudanças de auth
supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth state change:', event, session);
    checkAuthAndInit();
});

// Eventos de autenticação
document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if (!email || !password) {
        document.getElementById('auth-message').textContent = 'Preencha email e senha.';
        return;
    }
    await login(email, password);
});
document.getElementById('logout-btn').addEventListener('click', logout);

// ====================
// ESTADO GLOBAL
// ====================
let selectedDomains = [];
let unlockedCards = [];
let blockLimits = { ancestralidade: 2, subclasse: 3, loadouts: 5, cofre: 5 };
let blockCards = { ancestralidade: [], subclasse: [], loadouts: [], cofre: [] };
let currentBlock = null;
let totalRecoil = 0;
let selectedCardNames = new Set();

// Viewer
let currentViewedCard = null;

// ====================
// INIT
// ====================
function init() {
    const primarySelect = document.getElementById('primary-domain');
    const secondarySelect = document.getElementById('secondary-domain');
    const classSelect = document.getElementById('class-select');

    data.domains.forEach(d => {
        primarySelect.innerHTML += `<option value="${d}">${d}</option>`;
        secondarySelect.innerHTML += `<option value="${d}">${d}</option>`;
    });

    data.classes.forEach(c => {
        classSelect.innerHTML += `<option value="${c}">${c}</option>`;
    });

    updateSubclass();

    document.getElementById('level').addEventListener('change', updateUnlockedCards);
    document.getElementById('multiclass').addEventListener('change', updateMulticlassDomains);
    document.getElementById('primary-domain').addEventListener('change', updateDomains);
    document.getElementById('secondary-domain').addEventListener('change', updateDomains);
    document.getElementById('class-select').addEventListener('change', updateSubclass);

    updateUnlockedCards();
    createSlots();
}

// ====================
// SLOTS
// ====================
function createSlots() {
    Object.keys(blockLimits).forEach(blockId => {
        const container = document.getElementById(`${blockId}-slots`);
        container.innerHTML = '';

        for (let i = 0; i < blockLimits[blockId]; i++) {
            const slot = document.createElement('div');
            slot.className = 'slot';
            slot.textContent = 'Slot Vazio';
            slot.onclick = () => openModal(blockId, i);
            container.appendChild(slot);
        }
    });
}

// ====================
// DOMÍNIOS / CLASSES
// ====================
function updateSubclass() {
    const classVal = document.getElementById('class-select').value;
    const subclassSelect = document.getElementById('subclass-select');
    subclassSelect.innerHTML = '<option value="">Selecione</option>';

    if (data.subclasses[classVal]) {
        data.subclasses[classVal].forEach(s => {
            subclassSelect.innerHTML += `<option value="${s}">${s}</option>`;
        });
    }
}

function updateDomains() {
    selectedDomains = [
        document.getElementById('primary-domain').value,
        document.getElementById('secondary-domain').value
    ].filter(Boolean);

    const multiclassVal = parseInt(document.getElementById('multiclass').value);
    for (let i = 0; i < multiclassVal; i++) {
        const extra = document.querySelector(`#extra-domains select:nth-child(${i + 1})`);
        if (extra?.value) selectedDomains.push(extra.value);
    }

    updateUnlockedCards();
}

function updateMulticlassDomains() {
    const multiclassVal = parseInt(document.getElementById('multiclass').value);
    const extraDomains = document.getElementById('extra-domains');
    extraDomains.innerHTML = '';

    for (let i = 0; i < multiclassVal; i++) {
        extraDomains.innerHTML += `
            <div>
                <label>Domínio Extra ${i + 1}:</label>
                <select onchange="updateDomains()">
                    <option value="">Selecione</option>
                    ${data.domains.map(d => `<option value="${d}">${d}</option>`).join('')}
                </select>
            </div>
        `;
    }

    updateDomains();
}

function updateUnlockedCards() {
    const level = parseInt(document.getElementById('level').value);
    unlockedCards = data.cards.filter(card => card.level <= level);
}

// ====================
// FUNÇÃO AUXILIAR: VERIFICAR SE CARTA JÁ SELECIONADA
// ====================
function isCardSelected(cardName) {
    return selectedCardNames.has(cardName);
}

// ====================
// MODAL DE SELEÇÃO
// ====================
function openModal(blockId, slotIndex) {
    currentBlock = { blockId, slotIndex };

    const modal = document.getElementById('card-modal');
    const modalCards = document.getElementById('modal-cards');

    let filtered = unlockedCards;

    if (blockId === 'ancestralidade') {
        filtered = slotIndex === 0
            ? filtered.filter(c => c.subtype === 'Ancestralidade-Raça')
            : filtered.filter(c => c.subtype === 'Ancestralidade-Comunidade');
    } else if (blockId === 'subclasse') {
        const selectedSubclass = document.getElementById('subclass-select').value;
        const map = ['Foundation', 'Specialization', 'Maestry'];
        filtered = filtered.filter(c => c.subtype === `Subclasse-${map[slotIndex]}` && c.subclass === selectedSubclass);
    } else if (blockId === 'loadouts') {
        filtered = filtered.filter(c => selectedDomains.includes(c.domain) && (c.type === 'Loadout' || c.type === 'Cofre'));
    } else if (blockId === 'cofre') {
        filtered = filtered.filter(c => selectedDomains.includes(c.domain) && (c.type === 'Loadout' || c.type === 'Cofre'));
    }

    filtered = filtered.filter(c => !isCardSelected(c.name));

    modalCards.innerHTML = filtered.map(card => `
        <div class="modal-card" onclick='selectCard(${JSON.stringify(card)})'>
            <img src="${card.image}">
            <strong>${card.name}</strong>
        </div>
    `).join('');

    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('card-modal').style.display = 'none';
    currentBlock = null;
}

function selectCard(card) {
    const { blockId, slotIndex } = currentBlock;

    if (isCardSelected(card.name)) {
        alert('Esta carta já foi selecionada.');
        return;
    }

    selectedCardNames.add(card.name);

    if (blockId === 'loadouts' && card.type === 'Cofre') {
        const existingCard = blockCards[blockId][slotIndex];
        if (existingCard) {
            const cofreSlots = blockCards.cofre;
            const emptySlotIndex = cofreSlots.findIndex(c => c === null || c === undefined);
            if (emptySlotIndex !== -1) {
                cofreSlots[emptySlotIndex] = existingCard;
                updateSlotDisplay('cofre', emptySlotIndex);
                totalRecoil += existingCard.recoil;
            } else {
                alert('Não há espaço vazio em Cofre para a troca.');
                selectedCardNames.delete(card.name);
                return;
            }
        }
    }

    blockCards[blockId][slotIndex] = {
        ...card,
        tokens: 0,
        tokenColor: 'red'
    };

    updateSlotDisplay(blockId, slotIndex);
    closeModal();
}

// ====================
// SLOT VISUAL
// ====================
function updateSlotDisplay(blockId, slotIndex) {
    const slots = document.getElementById(`${blockId}-slots`).children;
    const card = blockCards[blockId][slotIndex];
    const slot = slots[slotIndex];

    slot.oncontextmenu = e => {
        e.preventDefault();
        if (card) {
            selectedCardNames.delete(card.name);
        }
        blockCards[blockId][slotIndex] = null;
        updateSlotDisplay(blockId, slotIndex);
    };

    if (!card) {
        slot.className = 'slot';
        slot.textContent = 'Slot Vazio';
        slot.onclick = () => openModal(blockId, slotIndex);
        return;
    }

    slot.className = 'slot filled';
    slot.onclick = () => openCardViewer(card);

    slot.innerHTML = `
        <div class="card">
            <img src="${card.image}">
        </div>
    `;

    renderTokensOnSlot(slot, card);
}

function renderTokensOnSlot(slot, card) {
    let token = slot.querySelector('.token');
    if (card.tokens > 0) {
        if (!token) {
            token = document.createElement('div');
            token.className = 'token';
            slot.appendChild(token);
        }
        token.style.background = card.tokenColor;
        token.textContent = card.tokens > 99 ? '99+' : card.tokens;
    } else if (token) {
        token.remove();
    }
}

// =====================
// CARD VIEWER + TOKENS
// =====================
function openCardViewer(card) {
    currentViewedCard = card;
    const viewer = document.getElementById('card-viewer');
    const viewerImage = document.getElementById('viewer-image');
    const tokenColorSelect = document.getElementById('token-color');

    viewerImage.src = card.image;
    tokenColorSelect.value = card.tokenColor || 'red';
    viewer.style.display = 'flex';

    renderTokensOnViewer();
}

function closeViewer() {
    document.getElementById('card-viewer').style.display = 'none';
    currentViewedCard = null;
}

function renderTokensOnViewer() {
    const viewerContent = document.querySelector('.card-viewer-content');
    let token = viewerContent.querySelector('.token');

    if (currentViewedCard.tokens > 0) {
        if (!token) {
            token = document.createElement('div');
            token.className = 'token';
            token.style.position = 'absolute';
            token.style.top = '10px';
            token.style.right = '10px';
            viewerContent.appendChild(token);
        }
        token.style.background = currentViewedCard.tokenColor;
        token.textContent = currentViewedCard.tokens > 99 ? '99+' : currentViewedCard.tokens;
    } else if (token) {
        token.remove();
    }
}

document.getElementById('add-token').onclick = () => {
    if (currentViewedCard.tokens < 99) {
        currentViewedCard.tokens++;
        renderTokensOnViewer();
        updateSlotAfterTokenChange();
    }
};

document.getElementById('remove-token').onclick = () => {
    if (currentViewedCard.tokens > 0) {
        currentViewedCard.tokens--;
        renderTokensOnViewer();
        updateSlotAfterTokenChange();
    }
};

document.getElementById('token-color').onchange = (e) => {
    currentViewedCard.tokenColor = e.target.value;
    renderTokensOnViewer();
    updateSlotAfterTokenChange();
};

function updateSlotAfterTokenChange() {
    for (const blockId in blockCards) {
        const index = blockCards[blockId].findIndex(c => c === currentViewedCard);
        if (index !== -1) {
            updateSlotDisplay(blockId, index);
            break;
        }
    }
}

// =====================
// SALVAR PRANCHETA
// =====================
document.getElementById('save-board').addEventListener('click', saveBoard);

async function saveBoard() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        alert('Você precisa estar logado para salvar a prancheta.');
        return;
    }

    totalRecoil = 0;
    Object.values(blockCards).forEach(block => {
        block.forEach(card => {
            if (card) totalRecoil += card.recoil;
        });
    });

    document.getElementById('recoil-display').innerHTML = `
        Recuo Total da Prancheta: <strong>-${totalRecoil}</strong><br>
        <small>Aplique este valor na ficha do personagem</small>
    `;

    const pranchetaData = {
        user_id: user.id,
        selectedDomains,
        blockCards,
        totalRecoil,
        level: document.getElementById('level').value,
        multiclass: document.getElementById('multiclass').value,
        classSelected: document.getElementById('class-select').value,
        subclassSelected: document.getElementById('subclass-select').value
    };

    const { error } = await supabase
        .from('pranchetas')
        .upsert(pranchetaData, { onConflict: 'user_id' });

    if (error) {
        alert('Erro ao salvar: ' + error.message);
    } else {
        alert('Prancheta salva com sucesso!');
    }
}

// =====================
// FUNÇÃO PARA TOGGLE DOMAIN LIST (se necessário)
// =====================
function toggleDomainList(type) {
    const list = document.getElementById(`${type}-domain-list`);
    list.style.display = list.style.display === 'block' ? 'none' : 'block';
}

