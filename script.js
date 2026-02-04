// Adicionar o script do Supabase no HTML (antes do seu script JS):
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

// =====================
// SUPABASE CONFIG
// =====================
const supabaseUrl = 'https://ynznnuogfedbvxoojcdp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inluem5udW9nZmVkYnZ4b29qY2RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNTA0MTcsImV4cCI6MjA4NTcyNjQxN30._RhkU6Fg-VR0eMFDYTF-LVnLgqRDuuFOr0xhsACSczs';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// =====================
// CARREGAR DADOS DO SUPABASE
// =====================
let data;
async function loadData() {
    try {
        // Buscar domínios
        const { data: domainsData, error: domainsError } = await supabase
            .from('domains')
            .select('name');
        if (domainsError) throw domainsError;

        // Buscar classes
        const { data: classesData, error: classesError } = await supabase
            .from('classes')
            .select('name');
        if (classesError) throw classesError;

        // Buscar subclasses (assumindo tabela com colunas: class_name, subclass_name)
        const { data: subclassesData, error: subclassesError } = await supabase
            .from('subclasses')
            .select('class_name, subclass_name');
        if (subclassesError) throw subclassesError;

        // Organizar subclasses em um objeto
        const subclasses = {};
        subclassesData.forEach(item => {
            if (!subclasses[item.class_name]) subclasses[item.class_name] = [];
            subclasses[item.class_name].push(item.subclass_name);
        });

        // Buscar cartas (assumindo tabela com colunas: name, level, subtype, subclass, domain, type, image, recoil)
        const { data: cardsData, error: cardsError } = await supabase
            .from('cards')
            .select('*');
        if (cardsError) throw cardsError;

        // Estruturar os dados como no original
        data = {
            domains: domainsData.map(d => d.name),
            classes: classesData.map(c => c.name),
            subclasses: subclasses,
            cards: cardsData
        };

        init();
    } catch (error) {
        console.error('Erro ao carregar dados do Supabase:', error);
    }
}

// Chamar loadData em vez de fetch
loadData();

// =====================
// ESTADO GLOBAL
// =====================
let selectedDomains = [];
let unlockedCards = [];
let blockLimits = { ancestralidade: 2, subclasse: 3, loadouts: 5, cofre: 5 }; // Limites base; subclasse será dinâmico
let blockCards = { ancestralidade: [[], []], subclasse: [[], [], []], loadouts: [], cofre: [] }; // Agora arrays para suportar múltiplas cartas por slot
let currentBlock = null;
let totalRecoil = 0; // Rastrear recuo total baseado em trocas
let selectedCardNames = new Set(); // Para impedir seleção duplicada de cartas
let mesticoEnabled = false; // Estado do campo Mestiço
let extraSubclasses = []; // Lista de subclasses extras

// Viewer
let currentViewedCard = null;

// =====================
// INIT
// =====================
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
    document.getElementById('multiclass').addEventListener('change', updateMulticlass);
    document.getElementById('primary-domain').addEventListener('change', updateDomains);
    document.getElementById('secondary-domain').addEventListener('change', updateDomains);
    document.getElementById('class-select').addEventListener('change', updateSubclass);
    document.getElementById('mestico-select').addEventListener('change', updateMestico);

    updateUnlockedCards();
    createSlots();
}

// =====================
// SLOTS
// =====================
function createSlots() {
    Object.keys(blockLimits).forEach(blockId => {
        const container = document.getElementById(`${blockId}-slots`);
        container.innerHTML = '';

        let numSlots = blockLimits[blockId];
        // Removido: Não aumentar slots para subclasse extras

        for (let i = 0; i < numSlots; i++) {
            const slot = document.createElement('div');
            slot.className = 'slot';
            slot.textContent = 'Slot Vazio';
            slot.onclick = () => openModal(blockId, i);
            container.appendChild(slot);
        }
    });
}

// =====================
// DOMÍNIOS / CLASSES / MESTIÇO
// =====================
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

function updateMulticlass() {
    const multiclassVal = parseInt(document.getElementById('multiclass').value);
    const extraDomains = document.getElementById('extra-domains');
    const extraSubclassesDiv = document.getElementById('extra-subclasses');
    extraDomains.innerHTML = '';
    extraSubclassesDiv.innerHTML = '';
    extraSubclasses = [];

    // Coletar todas as subclasses únicas para o select
    const allSubclasses = new Set();
    Object.values(data.subclasses).forEach(subs => subs.forEach(s => allSubclasses.add(s)));
    const subclassOptions = Array.from(allSubclasses).map(s => `<option value="${s}">${s}</option>`).join('');

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

        extraSubclassesDiv.innerHTML += `
            <div>
                <label>Subclasse Extra ${i + 1}:</label>
                <select onchange="updateExtraSubclasses()">
                    <option value="">Selecione</option>
                    ${subclassOptions}
                </select>
            </div>
        `;
    }

    updateDomains();
    createSlots(); // Recriar slots (mas sem aumentar para subclasse)
}

function updateExtraSubclasses() {
    extraSubclasses = [];
    const selects = document.querySelectorAll('#extra-subclasses select');
    selects.forEach(select => {
        if (select.value) extraSubclasses.push(select.value);
    });
    createSlots(); // Atualizar slots
}

function updateMestico() {
    mesticoEnabled = document.getElementById('mestico-select').value === 'sim';
    createSlots(); // Recriar slots para ajustar limite de Ancestralidade
}

function updateUnlockedCards() {
    const level = parseInt(document.getElementById('level').value);
    unlockedCards = data.cards.filter(card => card.level <= level);
}

// =====================
// FUNÇÃO AUXILIAR: VERIFICAR SE CARTA JÁ SELECIONADA
// =====================
function isCardSelected(cardName) {
    return selectedCardNames.has(cardName);
}

// =====================
// MODAL DE SELEÇÃO
// =====================
function openModal(blockId, slotIndex) {
    currentBlock = { blockId, slotIndex };

    const modal = document.getElementById('card-modal');
    const modalCards = document.getElementById('modal-cards');

    let filtered = unlockedCards;

    if (blockId === 'ancestralidade') {
        if (slotIndex === 0) {
            filtered = filtered.filter(c => c.subtype === 'Ancestralidade-Raça');
        } else {
            filtered = filtered.filter(c => c.subtype === 'Ancestralidade-Comunidade');
        }
    } else if (blockId === 'subclasse') {
        // Novo: Filtrar por qualquer subclasse selecionada (principal + extras)
        const selectedSubclasses = [document.getElementById('subclass-select').value, ...extraSubclasses].filter(Boolean);
        const map = ['Foundation', 'Specialization', 'Maestry'];
        const subtype = `Subclasse-${map[slotIndex % 3]}`;
        filtered = filtered.filter(c => c.subtype === subtype && selectedSubclasses.includes(c.subclass));
    } else if (blockId === 'loadouts') {
        filtered = filtered.filter(c => selectedDomains.includes(c.domain) && (c.type === 'Loadout' || c.type === 'Cofre'));
    } else if (blockId === 'cofre') {
        filtered = filtered.filter(c => selectedDomains.includes(c.domain) && (c.type === 'Loadout' || c.type === 'Cofre'));
    }

    // Filtrar cartas já selecionadas
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

    // Verificar se a carta já está selecionada
    if (isCardSelected(card.name)) {
        alert('Esta carta já foi selecionada.');
        return;
    }

    // Adicionar à lista de selecionadas
    selectedCardNames.add(card.name);

    // Para Ancestralidade Slot 0 (Raça), se Mestiço, permitir múltiplas cartas
    if (blockId === 'ancestralidade' && slotIndex === 0 && mesticoEnabled) {
        if (blockCards[blockId][slotIndex].length < 2) {
            blockCards[blockId][slotIndex].push({
                ...card,
                tokens: 0,
                tokenColor: 'red'
            });
        } else {
            alert('Slot de Raça já tem 2 cartas (Mestiço).');
            selectedCardNames.delete(card.name);
            return;
        }
    } else {
        // Para outros slots, substituir
        if (blockId === 'loadouts' && card.type === 'Cofre') {
            // Troca para Cofre
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
    }

    updateSlotDisplay(blockId, slotIndex);
    closeModal();
}

// =====================
// SLOT VISUAL
// =====================
function updateSlotDisplay(blockId, slotIndex) {
    const slots = document.getElementById(`${blockId}-slots`).children;
    const cards = blockCards[blockId][slotIndex];
    const slot = slots[slotIndex];

    slot.oncontextmenu = e => {
        e.preventDefault();
        if (Array.isArray(cards)) {
            cards.forEach(c => selectedCardNames.delete(c.name));
            blockCards[blockId][slotIndex] = [];
        } else {
            if (cards) selectedCardNames.delete(cards.name);
            blockCards[blockId][slotIndex] = null;
        }
        updateSlotDisplay(blockId, slotIndex);
    };

    if (!cards || (Array.isArray(cards) && cards.length === 0)) {
        slot.className = 'slot';
        slot.textContent = 'Slot Vazio';
        slot.onclick = () => openModal(blockId, slotIndex);
        return;
    }

    slot.className = 'slot filled';
    if (Array.isArray(cards)) {
        slot.className += ' multi-card';
        slot.innerHTML = cards.map(card => `
            <div class="card">
                <img src="${card.image}" onclick="openCardViewer(${JSON.stringify(card)})">
            </div>
        `).join('');
        slot.onclick = () => openCardViewer(cards); // Passar array para viewer
    } else {
        slot.onclick = () => openCardViewer(cards);
        slot.innerHTML = `
            <div class="card">
                <img src="${cards.image}">
            </div>
        `;
    }

    // Renderizar fichas (apenas para a primeira carta se múltiplas)
    const cardForTokens = Array.isArray(cards) ? cards[0] : cards;
    renderTokensOnSlot(slot, cardForTokens);
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
function openCardViewer(cardOrArray) {
    currentViewedCard = cardOrArray; // Pode ser uma carta ou array
    const viewer = document.getElementById('card-viewer');
    const viewerImages = document.getElementById('viewer-images'); // Assumindo que o HTML foi ajustado para ter este ID
    const tokenColorSelect = document.getElementById('token-color');

    if (Array.isArray(cardOrArray)) {
        // Exibir múltiplas imagens
        viewerImages.innerHTML = cardOrArray.map(card => `<img src="${card.image}" onclick="selectCardForTokens(${JSON.stringify(card)})">`).join('');
        tokenColorSelect.value = cardOrArray[0].tokenColor || 'red'; // Usar cor da primeira
    } else {
        viewerImages.innerHTML = `<img src="${cardOrArray.image}">`;
        tokenColorSelect.value = cardOrArray.tokenColor || 'red';
    }

    viewer.style.display = 'flex';
    renderTokensOnViewer();
}

function selectCardForTokens(card) {
    currentViewedCard = card; // Selecionar carta específica para tokens
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

// Eventos dos botões de ficha no viewer
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
        const cards = blockCards[blockId];
        for (let i = 0; i < cards.length; i++) {
            if (Array.isArray(cards[i])) {
                if (cards[i].includes(currentViewedCard)) {
                    updateSlotDisplay(blockId, i);
                    return;
                }
            } else if (cards[i] === currentViewedCard) {
                updateSlotDisplay(blockId, i);
                return;
            }
        }
    }
}

// =====================
// SALVAR PRANCHETA (AGORA COM SUPABASE)
// =====================
document.getElementById('save-board').addEventListener('click', saveBoard);

async function saveBoard() {
    // Calcular recoil como antes
    document.getElementById('recoil-display').innerHTML = `
        Recuo Total da Prancheta: <strong>-${totalRecoil}</strong><br>
        <small>Aplique este valor na ficha do personagem</small>
    `;

    // Opcional: Salvar a prancheta no Supabase
    // Assumindo uma tabela 'boards' com colunas: id (auto), name, data (JSON), created_at
    const boardName = prompt('Nome da Prancheta (opcional):');
    if (boardName !== null) { // Se não cancelou
        const boardData = {
            name: boardName || 'Prancheta Sem Nome',
            data: JSON.stringify({
                selectedDomains,
                blockCards,
                totalRecoil,
                selectedCardNames: Array.from(selectedCardNames),
                mesticoEnabled,
                extraSubclasses,
                level: document.getElementById('level').value,
                multiclass: document.getElementById('multiclass').value,
                primaryDomain: document.getElementById('primary-domain').value,
                secondaryDomain: document.getElementById('secondary-domain').value,
                classSelect: document.getElementById('class-select').value,
                subclassSelect: document.getElementById('subclass-select').value
            })
        };

        try {
            const { data, error } = await supabase
                .from('boards')
                .insert([boardData]);
            if (error) throw error;
            alert('Prancheta salva com sucesso!');
        } catch (error) {
            console.error('Erro ao salvar prancheta:', error);
            alert('Erro ao salvar prancheta.');
        }
    }
}

// =====================
// CARREGAR PRANCHETA (NOVO COM SUPABASE)
// =====================
document.getElementById('load-board').addEventListener('click', loadBoard);

async function loadBoard() {
    try {
        const { data: boards, error } = await supabase
            .from('boards')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;

        if (boards.length === 0) {
            alert('Nenhuma prancheta salva encontrada.');
            return;
        }

        // Simples: Carregar a mais recente ou permitir seleção
        const board = boards[0]; // Para simplicidade, a mais recente
        const boardData = JSON.parse(board.data);

        // Restaurar estado
        selectedDomains = boardData.selectedDomains || [];
        blockCards = boardData.blockCards || { ancestralidade: [[], []], subclasse: [[], [], []], loadouts: [], cofre: [] };
        totalRecoil = boardData.totalRecoil || 0;
        selectedCardNames = new Set(boardData.selectedCardNames || []);
        mesticoEnabled = boardData.mesticoEnabled || false;
        extraSubclasses = boardData.extraSubclasses || [];

        // Restaurar selects
        document.getElementById('level').value = boardData.level || 1;
        document.getElementById('multiclass').value = boardData.multiclass || 0;
        document.getElementById('primary-domain').value = boardData.primaryDomain || '';
        document.getElementById('secondary-domain').value = boardData.secondaryDomain || '';
        document.getElementById('class-select').value = boardData.classSelect || '';
        document.getElementById('subclass-select').value = boardData.subclassSelect || '';

        // Atualizar UI
        updateSubclass();
        updateMulticlass();
        updateDomains();
        updateUnlockedCards();
        createSlots();

        // Atualizar displays dos slots
        Object.keys(blockCards).forEach(blockId => {
            blockCards[blockId].forEach((cards, index) => {
                updateSlotDisplay(blockId, index);
            });
        });

        // Atualizar recoil display
        document.getElementById('recoil-display').innerHTML = `
            Recuo Total da Prancheta: <strong>-${totalRecoil}</strong><br>
            <small>Aplique este valor na ficha do personagem</small>
        `;

        alert('Prancheta carregada com sucesso!');
    } catch (error) {
        console.error('Erro ao carregar prancheta:', error);
        alert('Erro ao carregar prancheta.');
    }
}

// =====================
// FUNÇÃO PARA TOGGLE DOMAIN LIST (se necessário)
// =====================
function toggleDomainList(type) {
    const list = document.getElementById(`${type}-domain-list`);
    list.style.display = list.style.display === 'block' ? 'none' : 'block';
}
