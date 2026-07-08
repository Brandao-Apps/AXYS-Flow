// ==========================================
// AXYS FLOW - CORE LOGIC
// ==========================================

const SB_URL = 'https://hdgoghefokrpukmefsaz.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZ29naGVmb2tycHVrbWVmc2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NTgxMTksImV4cCI6MjA5NTUzNDExOX0.eDUGsfEFYVV_Dpjbo-MwXaP5NGJuPVSmv0ygsl7A2CY';
const sb = window.supabase.createClient(SB_URL, SB_KEY);

let user = null;

// State objects
let profile = null;
let studyProgress = null;
let tasks = [];
let rewards = [];
let rewardHistory = [];
let transactions = [];
let categories = [];

let currentTxType = 'out';

// ── UI HELPERS ─────────────────────────────────────────

let toastTimer;
function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

function fmtMoney(v) {
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcLevel(xp) {
    // Basic progression: level = floor(sqrt(xp) * 0.5) + 1
    if(!xp || xp < 0) return 1;
    return Math.floor(Math.sqrt(xp) * 0.2) + 1;
}

function calcXpForNextLevel(level) {
    return Math.pow((level) / 0.2, 2);
}

// ── NAVIGATION & MODALS ────────────────────────────────

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.remove('active', 'text-axys-accent');
            b.classList.add('text-axys-textMuted');
            b.querySelector('i').classList.replace('ph-fill', 'ph');
        });
        btn.classList.add('active', 'text-axys-accent');
        btn.classList.remove('text-axys-textMuted');
        btn.querySelector('i').classList.replace('ph', 'ph-fill');

        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

function openModal(id) {
    document.getElementById('modal-backdrop').classList.remove('hidden');
    const modal = document.getElementById(id);
    modal.classList.remove('translate-y-full');
}

function closeAllModals() {
    document.getElementById('modal-backdrop').classList.add('hidden');
    ['modal-task', 'modal-reward', 'modal-tx', 'modal-income', 'modal-cat'].forEach(id => {
        document.getElementById(id).classList.add('translate-y-full');
    });
}

// Specific Modal Openers
function openTaskModal() { openModal('modal-task'); }
function openRewardModal() { openModal('modal-reward'); }
function openTxModal() {
    currentTxType = 'out'; updateTxTypeUI();
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-desc').value = '';
    document.getElementById('tx-cat').value = '';
    openModal('modal-tx');
}
function openIncomeModal() { 
    document.getElementById('income-amount').value = profile?.monthly_income || '';
    openModal('modal-income');
}
function openCatModal() { openModal('modal-cat'); }

function setTxType(type) {
    currentTxType = type;
    updateTxTypeUI();
}

function updateTxTypeUI() {
    const btnOut = document.getElementById('btn-type-out');
    const btnIn = document.getElementById('btn-type-in');
    if(currentTxType === 'out') {
        btnOut.className = 'flex-1 py-2 rounded-lg bg-axys-danger text-white font-bold text-sm';
        btnIn.className = 'flex-1 py-2 rounded-lg text-axys-textMuted font-bold text-sm';
    } else {
        btnIn.className = 'flex-1 py-2 rounded-lg bg-axys-success text-black font-bold text-sm';
        btnOut.className = 'flex-1 py-2 rounded-lg text-axys-textMuted font-bold text-sm';
    }
}


// ── AUTH ──────────────────────────────────────────────

sb.auth.onAuthStateChange((event, session) => {
    if (session) {
        user = session.user;
        document.getElementById('auth-view').classList.add('hidden');
        document.getElementById('app-view').classList.remove('hidden');
        document.getElementById('app-view').classList.add('flex');
        initApp();
    } else {
        user = null;
        document.getElementById('auth-view').classList.remove('hidden');
        document.getElementById('app-view').classList.add('hidden');
        document.getElementById('app-view').classList.remove('flex');
    }
});

async function login() {
    const e = document.getElementById('auth-email').value;
    const p = document.getElementById('auth-password').value;
    if(!e || !p) return toast('Preencha os campos');
    const { error } = await sb.auth.signInWithPassword({ email: e, password: p });
    if(error) toast(error.message);
}

async function register() {
    const e = document.getElementById('auth-email').value;
    const p = document.getElementById('auth-password').value;
    if(!e || !p) return toast('Preencha os campos');
    const { error } = await sb.auth.signUp({ email: e, password: p });
    if(error) toast(error.message);
    else toast('Conta criada! Verifique seu email ou faça login.');
}

async function logout() { await sb.auth.signOut(); }

// ── INIT & LOAD DATA ──────────────────────────────────

async function initApp() {
    await Promise.all([
        loadProfile(),
        loadStudyProgress(),
        loadTasks(),
        loadRewards(),
        loadRewardHistory(),
        loadCategories(),
        loadTransactions()
    ]);
    renderAll();
}

// ── DATA FETCHING ─────────────────────────────────────

async function loadProfile() {
    const { data } = await sb.from('users_profile').select('*').eq('user_id', user.id).single();
    if (data) {
        profile = data;
    } else {
        const { data: newData } = await sb.from('users_profile').insert({ user_id: user.id, monthly_income: 0, currency: 'BRL' }).select().single();
        profile = newData || { monthly_income: 0 };
    }
}

async function loadStudyProgress() {
    const { data } = await sb.from('study_progress').select('*').eq('user_id', user.id).single();
    if (data) {
        studyProgress = data;
        // Fix missing properties for new users migrating
        if(studyProgress.available_xp === undefined) studyProgress.available_xp = 0;
        if(!studyProgress.boxes) studyProgress.boxes = {};
    } else {
        studyProgress = {
            user_id: user.id, total_xp: 0, available_xp: 0, streak: 0, boxes: {}, checks: {}
        };
        await sb.from('study_progress').insert(studyProgress);
    }
}

async function loadTasks() {
    const { data } = await sb.from('tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    tasks = data || [];
}

async function loadRewards() {
    const { data } = await sb.from('rewards').select('*').eq('user_id', user.id).order('xp_cost', { ascending: true });
    rewards = data || [];
}

async function loadRewardHistory() {
    const { data } = await sb.from('reward_history').select('*').eq('user_id', user.id).order('redeemed_at', { ascending: false }).limit(5);
    rewardHistory = data || [];
}

async function loadCategories() {
    const { data } = await sb.from('categories').select('*').eq('user_id', user.id);
    categories = data || [];
    
    // Update Cat Dropdown
    const sel = document.getElementById('tx-cat');
    sel.innerHTML = '<option value="">Sem categoria</option>';
    categories.forEach(c => {
        sel.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });
}

async function loadTransactions() {
    // Only load current month for performance
    const d = new Date();
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    const { data } = await sb.from('transactions').select('*').eq('user_id', user.id).gte('date', firstDay).order('date', { ascending: false });
    transactions = data || [];
}

// ── SAVE OPERATIONS ───────────────────────────────────

async function addXP(amount) {
    if(!studyProgress) return;
    studyProgress.total_xp += amount;
    studyProgress.available_xp += amount;
    // visual flair
    toast(`+${amount} XP Adquirido! ⭐`);
    await saveStudyProgress();
    renderHeader();
}

async function saveStudyProgress() {
    await sb.from('study_progress').upsert({
        user_id: user.id,
        total_xp: studyProgress.total_xp,
        available_xp: studyProgress.available_xp,
        streak: studyProgress.streak,
        boxes: studyProgress.boxes,
        updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
}

async function saveTask() {
    const title = document.getElementById('task-title').value;
    const xp = parseInt(document.getElementById('task-xp').value) || 20;
    if(!title) return toast('Preencha o título');
    
    const { data, error } = await sb.from('tasks').insert({ user_id: user.id, title, xp_reward: xp }).select();
    if(error) { toast('Erro ao salvar'); return; }
    
    tasks.unshift(data[0]);
    closeAllModals();
    document.getElementById('task-title').value = '';
    if(currentCycle) selectCycle(currentCycle); renderCalendar();
    toast('Missão criada!');
}

async function completeTask(id, xp_reward) {
    const taskIndex = tasks.findIndex(t => t.id === id);
    if(taskIndex === -1) return;
    
    tasks[taskIndex].is_completed = true;
    await sb.from('tasks').update({ is_completed: true }).eq('id', id);
    
    addXP(xp_reward);
    if(currentCycle) selectCycle(currentCycle); renderCalendar();
}

async function saveReward() {
    const title = document.getElementById('reward-title').value;
    const cost = parseInt(document.getElementById('reward-cost').value) || 100;
    const icon = document.getElementById('reward-icon').value || '🎁';
    if(!title) return toast('Preencha o título');
    
    const { data, error } = await sb.from('rewards').insert({ user_id: user.id, title, xp_cost: cost, icon }).select();
    if(!error) {
        rewards.push(data[0]);
        rewards.sort((a,b) => a.xp_cost - b.xp_cost);
        closeAllModals();
        renderStore();
        toast('Prêmio adicionado!');
    }
}

async function redeemReward(id) {
    const rew = rewards.find(r => r.id === id);
    if(!rew) return;
    if(studyProgress.available_xp < rew.xp_cost) {
        return toast('XP Insuficiente!');
    }
    
    // Deduct XP
    studyProgress.available_xp -= rew.xp_cost;
    await saveStudyProgress();
    
    // Log history
    const log = { user_id: user.id, reward_title: rew.title, xp_spent: rew.xp_cost };
    const { data } = await sb.from('reward_history').insert(log).select();
    if(data) rewardHistory.unshift(data[0]);
    
    renderHeader();
    renderStore();
    toast(`Resgatou: ${rew.title} 🎉`);
}

// AXYS Finance Saves
async function saveIncome() {
    const v = parseFloat(document.getElementById('income-amount').value);
    if(isNaN(v)) return;
    await sb.from('users_profile').upsert({ user_id: user.id, monthly_income: v, currency: 'BRL' }, { onConflict: 'user_id' });
    profile.monthly_income = v;
    closeAllModals();
    renderVault();
    toast('Renda atualizada!');
}

async function saveCat() {
    const n = document.getElementById('cat-name').value;
    const l = parseFloat(document.getElementById('cat-limit').value) || 0;
    const c = document.getElementById('cat-color').value;
    if(!n) return;
    const { data } = await sb.from('categories').insert({ user_id: user.id, name: n, color: c, monthly_limit: l }).select();
    if(data) categories.push(data[0]);
    closeAllModals();
    loadCategories(); // reload to update dropdown
    renderVault();
    toast('Categoria salva!');
}

async function saveTx() {
    const v = parseFloat(document.getElementById('tx-amount').value);
    const d = document.getElementById('tx-desc').value;
    const c = document.getElementById('tx-cat').value;
    if(isNaN(v) || v <= 0) return toast('Valor inválido');
    
    const tx = {
        user_id: user.id,
        amount: v,
        description: d || 'Sem descrição',
        category_id: c || null,
        type: currentTxType,
        date: new Date().toISOString().split('T')[0]
    };
    
    const { data, error } = await sb.from('transactions').insert(tx).select();
    if(!error) {
        transactions.unshift(data[0]);
        // Give some small XP for logging a transaction! Gamification!
        addXP(5);
        closeAllModals();
        renderVault();
        renderDash();
        toast('Lançamento salvo! +5 XP');
    }
}


// ── RENDERERS ─────────────────────────────────────────

function renderAll() {
    renderHeader();
    renderDash();
    if(currentCycle) selectCycle(currentCycle); renderCalendar();
    renderVault();
    renderStore();
}

function renderHeader() {
    if(!studyProgress) return;
    const lvl = calcLevel(studyProgress.total_xp);
    document.getElementById('user-level').textContent = lvl;
    document.getElementById('user-xp').textContent = studyProgress.total_xp;
    document.getElementById('store-available-xp').textContent = studyProgress.available_xp;
}

function renderDash() {
    if(!profile || !studyProgress) return;
    
    // Progress Bar
    const lvl = calcLevel(studyProgress.total_xp);
    const nextXp = calcXpForNextLevel(lvl);
    const prevXp = calcXpForNextLevel(lvl-1);
    const currentInLevel = studyProgress.total_xp - prevXp;
    const requiredForLevel = nextXp - prevXp;
    const pct = Math.min(100, Math.max(0, (currentInLevel / requiredForLevel) * 100));
    
    document.getElementById('xp-progress-bar').style.width = pct + '%';
    document.getElementById('xp-progress-text').textContent = Math.floor(studyProgress.total_xp);
    document.getElementById('dash-streak').textContent = studyProgress.streak;
    
    // Balance
    let bal = profile.monthly_income || 0;
    transactions.forEach(t => {
        if(t.type === 'in') bal += t.amount;
        else bal -= t.amount;
    });
    
    const bEl = document.getElementById('dash-balance');
    bEl.textContent = fmtMoney(bal);
    bEl.className = `text-xl font-bold font-mono ${bal >= 0 ? 'text-axys-success' : 'text-axys-danger'}`;
    
    // Dash Tasks preview
    const dashTasks = document.getElementById('dash-tasks');
    const pending = tasks.filter(t => !t.is_completed).slice(0,3);
    if(pending.length === 0) {
        dashTasks.innerHTML = '<div class="text-sm text-axys-textMuted text-center p-4 bg-axys-surface2 rounded-xl">Tudo limpo! Nenhuma missão pendente.</div>';
    } else {
        dashTasks.innerHTML = pending.map(t => `
            <div class="flex justify-between items-center bg-axys-surface2 p-3 rounded-xl border border-white/5">
                <div class="font-bold text-sm truncate pr-2">${t.title}</div>
                <div class="text-xs text-axys-accent font-bold bg-axys-surface px-2 py-1 rounded">⭐ ${t.xp_reward}</div>
            </div>
        `).join('');
    }
}

async function toggleEliteBlock(blockName) {
    if(!studyProgress.boxes) studyProgress.boxes = {};
    const isDone = studyProgress.boxes[blockName];
    
    if(!isDone) {
        studyProgress.boxes[blockName] = true;
        addXP(50); // Big reward for study block
    } else {
        studyProgress.boxes[blockName] = false;
        // Don't subtract XP on uncheck to avoid frustration, or do it if strict
    }
    await saveStudyProgress();
    if(currentCycle) selectCycle(currentCycle); renderCalendar();
}
let localUserXp = 0;

document.addEventListener('DOMContentLoaded', () => {
    atualizarDataVisual();
    carregarTarefas();
    document.getElementById('userXpDisplay').textContent = localUserXp;
});

function atualizarDataVisual() {
    const dataOpcoes = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dataFormatada = new Date().toLocaleDateString('pt-BR', dataOpcoes);
    document.getElementById('currentDate').textContent = dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1);
}

async function concluirTarefa(taskId, btnElement) {
    btnElement.disabled = true;
    const originalText = btnElement.innerHTML;
    btnElement.innerHTML = `<span class="animate-pulse">...</span>`;
    
    try {
        let tarefa = await buscarTarefa(taskId); 
        if (!tarefa) throw new Error("Tarefa não encontrada.");

        const xpGanho = tarefa.xp_value || 10;
        await adicionarXpUsuario(xpGanho);
        
        if (tarefa.recurrence_type && tarefa.recurrence_type !== 'none') {
            let novaData = new Date(tarefa.due_date);
            if (tarefa.recurrence_type === 'diaria') novaData.setDate(novaData.getDate() + 1);
            else if (tarefa.recurrence_type === 'semanal') novaData.setDate(novaData.getDate() + 7);
            else if (tarefa.recurrence_type === 'mensal') novaData.setMonth(novaData.getMonth() + 1);

            await atualizarDataTarefaNoSupabase(taskId, novaData);
        } else {
            await arquivarTarefaNoSupabase(taskId);
        }

        mostrarAnimacaoXP(xpGanho);
        
        const liElement = btnElement.closest('li');
        liElement.style.opacity = '0';
        liElement.style.transform = 'translateX(20px)';
        setTimeout(() => {
            liElement.remove();
            verificarListaVazia();
        }, 300);

    } catch (error) {
        console.error(error);
        btnElement.disabled = false;
        btnElement.innerHTML = originalText;
    }
}

async function carregarTarefas() {
    const list = document.getElementById('taskList');
    const emptyState = document.getElementById('emptyState');
    
    try {
        const { data, error } = await supabase
            .from('tasks').select('*').eq('is_completed', false).order('due_date', { ascending: true });
            
        if (error) throw error;
        list.innerHTML = ''; 
        if (data && data.length > 0) data.forEach(task => renderizarTarefaNaTela(task));
        else { list.appendChild(emptyState); emptyState.textContent = "Nenhuma tarefa para hoje. Descanso merecido!"; }
    } catch (e) {
        list.innerHTML = '';
        const mockTasks = [
            { id: 1, title: 'Estudar TypeScript', xp_value: 150, recurrence_type: 'none', due_date: new Date().toISOString() },
            { id: 2, title: 'Revisão Financeira', xp_value: 50, recurrence_type: 'semanal', due_date: new Date().toISOString() }
        ];
        mockTasks.forEach(task => renderizarTarefaNaTela(task));
    }
}

function renderizarTarefaNaTela(task) {
    const list = document.getElementById('taskList');
    const li = document.createElement('li');
    const iconeRecorrencia = task.recurrence_type !== 'none' ? `<span class="text-accent-500 ml-1">↺</span>` : '';

    li.className = "bg-dark-800 p-4 rounded-xl border border-dark-700 flex justify-between items-center group transition-all duration-300";
    li.innerHTML = `
        <div class="flex-1">
            <h3 class="text-white font-medium text-sm flex items-center">${task.title} ${iconeRecorrencia}</h3>
            <span class="text-xs text-accent-500 font-semibold mt-1 inline-block">${task.xp_value} XP</span>
        </div>
        <button onclick="concluirTarefa(${task.id}, this)" class="w-8 h-8 rounded-full border-2 border-dark-600 flex items-center justify-center hover:bg-accent-500 hover:text-dark-900 transition-all text-transparent hover:text-dark-900">
            ✓
        </button>
    `;
    list.appendChild(li);
}

async function buscarTarefa(id) { return { id: id, xp_value: 50, recurrence_type: 'diaria', due_date: new Date().toISOString() }; }
async function atualizarDataTarefaNoSupabase(id, novaData) { console.log(`Atualizou data para ${novaData}`); }
async function arquivarTarefaNoSupabase(id) { console.log(`Concluiu ${id}`); }

async function adicionarXpUsuario(xp) {
    localUserXp += xp;
    document.getElementById('userXpDisplay').textContent = localUserXp;
}

function mostrarAnimacaoXP(xp) {
    const overlay = document.getElementById('xpAnimation');
    const popup = document.getElementById('xpPopup');
    document.getElementById('xpGainedText').textContent = `+${xp} XP`;
    
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    popup.classList.remove('scale-90'); popup.classList.add('scale-100');
    
    setTimeout(() => {
        overlay.classList.add('opacity-0');
        popup.classList.remove('scale-100'); popup.classList.add('scale-90');
        setTimeout(() => overlay.classList.add('pointer-events-none'), 300);
    }, 1500);
}

function verificarListaVazia() {
    const list = document.getElementById('taskList');
    if (list.querySelectorAll('li:not(#emptyState)').length === 0) {
        list.innerHTML = `<li class="text-center text-gray-500 py-8 text-sm italic" id="emptyState">Tudo limpo!</li>`;
    }
}

function criarTarefaDeTeste() {
    const titulo = document.getElementById('novaTarefaTitle').value;
    if(!titulo) return;
    renderizarTarefaNaTela({ id: Date.now(), title: titulo, xp_value: 50, recurrence_type: 'none', due_date: new Date().toISOString() });
    document.getElementById('modalNovaTarefa').classList.add('hidden');
}
function renderVault() {
    document.getElementById('vault-income').textContent = fmtMoney(profile?.monthly_income || 0);
    
    // Transctions
    const list = document.getElementById('tx-list');
    if(transactions.length === 0) list.innerHTML = '<div class="text-sm text-axys-textMuted">Nenhum lançamento.</div>';
    else {
        list.innerHTML = transactions.slice(0,10).map(t => {
            const cat = categories.find(c => c.id === t.category_id);
            const color = cat ? cat.color : '#8B9BB4';
            const name = cat ? cat.name : 'Outros';
            const isOut = t.type === 'out';
            return `
            <div class="flex justify-between items-center bg-axys-surface2 p-3 rounded-xl border-l-4" style="border-left-color: ${color}">
                <div>
                    <div class="text-sm font-bold truncate w-40">${t.description}</div>
                    <div class="text-xs text-axys-textMuted">${name} • ${t.date}</div>
                </div>
                <div class="text-sm font-bold font-mono ${isOut ? 'text-white' : 'text-axys-success'}">
                    ${isOut ? '-' : '+'} ${fmtMoney(t.amount)}
                </div>
            </div>
            `;
        }).join('');
    }

    // Categories
    const cList = document.getElementById('cat-list');
    cList.innerHTML = categories.map(c => {
        let spent = 0;
        transactions.forEach(t => { if(t.category_id === c.id && t.type === 'out') spent += t.amount; });
        let limitHtml = '';
        if(c.monthly_limit > 0) {
            const pct = Math.min(100, (spent / c.monthly_limit) * 100);
            const isCrit = pct > 90;
            limitHtml = `
            <div class="w-full bg-axys-surface rounded-full h-1 mt-2">
                <div class="h-1 rounded-full ${isCrit ? 'bg-axys-danger' : 'bg-white'}" style="width: ${pct}%; background-color: ${isCrit ? '' : c.color}"></div>
            </div>
            <div class="text-[10px] text-right mt-1 text-axys-textMuted">${fmtMoney(spent)} / ${fmtMoney(c.monthly_limit)}</div>
            `;
        } else {
             limitHtml = `<div class="text-[10px] text-right mt-1 text-axys-textMuted">Gasto: ${fmtMoney(spent)}</div>`;
        }

        return `
        <div class="bg-axys-surface2 p-3 rounded-xl border border-white/5">
            <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full" style="background-color: ${c.color}"></div>
                <div class="text-sm font-bold flex-1">${c.name}</div>
            </div>
            ${limitHtml}
        </div>
        `;
    }).join('');
}

function renderStore() {
    const list = document.getElementById('rewards-list');
    list.innerHTML = rewards.map(r => {
        const canBuy = studyProgress?.available_xp >= r.xp_cost;
        return `
        <div class="bg-axys-surface2 p-4 rounded-2xl flex flex-col items-center text-center border border-white/5 relative overflow-hidden">
            <div class="text-3xl mb-2 z-10">${r.icon}</div>
            <div class="text-xs font-bold mb-3 z-10 h-8 flex items-center">${r.title}</div>
            <button onclick="redeemReward('${r.id}')" class="w-full py-2 rounded-lg text-xs font-bold z-10 transition ${canBuy ? 'bg-axys-accent text-black hover:bg-axys-accentH' : 'bg-axys-surface text-axys-textMuted cursor-not-allowed'}">
                ${r.xp_cost} XP
            </button>
            ${!canBuy ? '<div class="absolute inset-0 bg-black/40 z-0"></div>' : ''}
        </div>
        `;
    }).join('');

    const hList = document.getElementById('reward-history-list');
    if(rewardHistory.length === 0) hList.innerHTML = '<div class="text-xs">Nenhum resgate.</div>';
    else {
        hList.innerHTML = rewardHistory.map(h => `
            <div class="flex justify-between items-center border-b border-white/10 pb-1">
                <span>${h.reward_title}</span>
                <span class="text-axys-danger">-${h.xp_spent} XP</span>
            </div>
        `).join('');
    }
}

// ── ELITE MASTER PLAN ──
const CYCLES = {
  alfa: {
    name: 'Ciclo Alfa',
    months: [
      {
        title: 'Mês 1 — Consolidação Estrutural',
        weeks: [
          {
            id: 'a-w1', week: 1, title: 'O Núcleo de Existência',
            subjects: [
              { id: 'a-w1-pt', name: 'PORTUGUÊS', topics: ['Sintaxe da Oração — Termos Essenciais, Integrantes e Acessórios','Sujeito Indeterminado x Oração Sem Sujeito']},
              { id: 'a-w1-rlm', name: 'RLM', topics: ['Lógica de Proposições — Conectivos e Tabelas-Verdade','Proposições Simples e Compostas']},
              { id: 'a-w1-cont', name: 'CONTABILIDADE', topics: ['O Patrimônio — Conceito, Aspectos Qualitativo e Quantitativo','Bens, Direitos e Obrigações']},
              { id: 'a-w1-dc', name: 'DIR. CONSTITUCIONAL', topics: ['Direitos e Garantias Fundamentais (Art. 5º, I a X)','Colisão de Direitos e Princípio da Proporcionalidade']},
              { id: 'a-w1-da', name: 'DIR. ADMINISTRATIVO', topics: ['Regime Jurídico-Administrativo','Princípios Constitucionais Expressos e Implícitos']},
              { id: 'a-w1-dp', name: 'DIR. PENAL', topics: ['Princípios Gerais do Direito Penal Militar','Teoria do Crime — Fato Típico, Ilicitude e Culpabilidade']}
            ]
          },
          {
            id: 'a-w2', week: 2, title: 'Dialética da Norma',
            subjects: [
              { id: 'a-w2-pt', name: 'PORTUGUÊS', topics: ['Concordância Verbal — Casos Gerais','Sujeito Composto e Sujeito Posposto']},
              { id: 'a-w2-rlm', name: 'RLM / MATEMÁTICA', topics: ['Teoria dos Conjuntos — Operações','Problemas de Contagem com Conjuntos']},
              { id: 'a-w2-cont', name: 'CONTABILIDADE', topics: ['Equação Patrimonial e Variações','Fatos Permutativos, Modificativos e Mistos']},
              { id: 'a-w2-dc', name: 'DIR. CONSTITUCIONAL', topics: ['Direitos Políticos e Partidos Políticos','Inelegibilidades e Perda de Mandato']},
              { id: 'a-w2-da', name: 'DIR. ADMINISTRATIVO', topics: ['Poder de Polícia — Conceito, Atributos e Limites','Polícia Administrativa x Judiciária']},
              { id: 'a-w2-dp', name: 'DIR. PENAL', topics: ['Crimes contra a Vida — Homicídio Doloso e Culposo','Qualificadoras e Privilégios']}
            ]
          },
          {
            id: 'a-w3', week: 3, title: 'Estruturas de Controle',
            subjects: [
              { id: 'a-w3-pt', name: 'PORTUGUÊS', topics: ['Concordância Nominal — Regras Especiais','Adjetivo pós-nominal e acordos especiais']},
              { id: 'a-w3-rlm', name: 'RLM / MATEMÁTICA', topics: ['Razão e Proporção — Regra de Três Simples e Composta','Porcentagem e Variações']},
              { id: 'a-w3-cont', name: 'CONTABILIDADE', topics: ['Plano de Contas — Estrutura e Codificação','Contas Patrimoniais e de Resultado']},
              { id: 'a-w3-dc', name: 'DIR. CONSTITUCIONAL', topics: ['Poder Legislativo — Câmara e Senado','Imunidades Parlamentares e Comissões']},
              { id: 'a-w3-da', name: 'DIR. ADMINISTRATIVO', topics: ['Organização Administrativa — Centralização e Descentralização','Autarquias, Fundações e Empresas Estatais']},
              { id: 'a-w3-dp', name: 'DIR. PENAL', topics: ['Crimes contra o Patrimônio I — Furto e Roubo','Qualificadoras e Majorantes']}
            ]
          },
          {
            id: 'a-w4', week: 4, title: 'Poderes Aplicados',
            subjects: [
              { id: 'a-w4-pt', name: 'PORTUGUÊS', topics: ['Pontuação — Emprego da Vírgula','Ponto e Vírgula, Dois-Pontos e Travessão']},
              { id: 'a-w4-rlm', name: 'RLM / MATEMÁTICA', topics: ['Geometria Plana — Áreas e Perímetros','Semelhança de Triângulos e Teorema de Pitágoras']},
              { id: 'a-w4-cont', name: 'CONTABILIDADE', topics: ['Apuração do Resultado do Exercício','CMV, Lucro Bruto e Resultado Líquido']},
              { id: 'a-w4-dc', name: 'DIR. CONSTITUCIONAL', topics: ['Poder Executivo — Atribuições do Presidente, Governadores e Prefeitos','Crimes de Responsabilidade']},
              { id: 'a-w4-da', name: 'DIR. ADMINISTRATIVO', topics: ['Responsabilidade Civil do Estado — Evolução Histórica','Teoria do Risco Administrativo x Risco Integral — Excludentes']},
              { id: 'a-w4-dp', name: 'DIR. PENAL', topics: ['Culpabilidade — Elementos e Causas de Exclusão','Coação Moral Irresistível e Obediência Hierárquica']}
            ]
          }
        ]
      },
      {
        title: 'Mês 2 — Aprofundamento Analítico',
        weeks: [
          {
            id: 'a-w5', week: 5, title: 'Vínculos Estruturais e Segurança Institucional',
            subjects: [
              { id: 'a-w5-pt', name: 'PORTUGUÊS', topics: ['Regência Verbal e Nominal','Verbos que alteram sentido conforme preposição: Visar, Aspirar, Assistir']},
              { id: 'a-w5-rlm', name: 'RLM / MATEMÁTICA', topics: ['Análise Combinatória I — Princípio Fundamental da Contagem','Permutações Simples, Circulares e com Repetição']},
              { id: 'a-w5-cont', name: 'CONTABILIDADE', topics: ['Método das Partidas Dobradas e Escrituração Contábil','Lançamentos de 1ª, 2ª, 3ª e 4ª Fórmulas']},
              { id: 'a-w5-dc', name: 'DIR. CONSTITUCIONAL', topics: ['Forças Armadas e Defesa Nacional (Art. 142 e 143)','Regime Jurídico dos Militares e Restrições a Direitos Fundamentais']},
              { id: 'a-w5-da', name: 'DIR. ADMINISTRATIVO', topics: ['Atos Administrativos I — Conceito e Requisitos de Validade','Competência, Finalidade, Forma, Motivo e Objeto']},
              { id: 'a-w5-dp', name: 'DIR. PENAL', topics: ['Consumação e Tentativa','Desistência Voluntária, Arrependimento Eficaz e Crime Impossível']}
            ]
          },
          {
            id: 'a-w6', week: 6, title: 'Fenômenos de Fusão e Dinâmica de Polícia',
            subjects: [
              { id: 'a-w6-pt', name: 'PORTUGUÊS', topics: ['Crase — Regras de Ocorrência Obrigatória','Crase — Ocorrência Proibida e Facultativa']},
              { id: 'a-w6-rlm', name: 'RLM / MATEMÁTICA', topics: ['Teoria das Probabilidades I — Espaço Amostral e Eventos','Probabilidade Condicional e Eventos Independentes']},
              { id: 'a-w6-cont', name: 'CONTABILIDADE', topics: ['Livros Contábeis Obrigatórios e Facultativos — Diário, Razão, Caixa','Erros de Escrituração e Formas de Retificação']},
              { id: 'a-w6-dc', name: 'DIR. CONSTITUCIONAL', topics: ['Segurança Pública (Art. 144)','Estrutura e Atribuições das Polícias e Guardas Municipais']},
              { id: 'a-w6-da', name: 'DIR. ADMINISTRATIVO', topics: ['Atos Administrativos II — Atributos: Presunção, Imperatividade, Autoexecutoriedade','Extinção dos Atos: Anulação, Revogação e Cassação']},
              { id: 'a-w6-dp', name: 'DIR. PENAL', topics: ['Concurso de Pessoas — Teorias e Requisitos','Coautoria, Participação e Teoria Monista']}
            ]
          },
          {
            id: 'a-w7', week: 7, title: 'Estatística Descritiva e Regime Estatutário',
            subjects: [
              { id: 'a-w7-pt', name: 'PORTUGUÊS', topics: ['Colocação Pronominal — Próclise, Ênclise e Mesóclise','Locuções Verbais e Tempos Compostos']},
              { id: 'a-w7-rlm', name: 'ESTATÍSTICA', topics: ['Estatística Descritiva — Medidas de Posição Central','Média Aritmética, Mediana e Moda']},
              { id: 'a-w7-cont', name: 'CONTABILIDADE', topics: ['O Balancete de Verificação — Estrutura e Finalidade','Limitações: Erros que o Balancete não detecta']},
              { id: 'a-w7-dc', name: 'DIR. CONSTITUCIONAL', topics: ['Poder Legislativo — Processo Legislativo Orçamentário','Fiscalização Contábil e Financeira']},
              { id: 'a-w7-da', name: 'DIR. ADMINISTRATIVO', topics: ['Agentes Públicos e Regime Jurídico dos Servidores','Concurso Público, Estabilidade, Demissão e PAD']},
              { id: 'a-w7-dp', name: 'DIR. PENAL', topics: ['Crimes contra a Adm. Pública I — Praticados por Funcionário Público','Peculato, Concussão, Corrupção Passiva e Prevaricação']}
            ]
          },
          {
            id: 'a-w8', week: 8, title: 'Textualidade e Intervenção de Propriedade',
            subjects: [
              { id: 'a-w8-pt', name: 'PORTUGUÊS', topics: ['Coesão e Coerência Textual — Referência Anafórica e Catafórica','Emprego dos Pronomes Demonstrativos']},
              { id: 'a-w8-rlm', name: 'ESTATÍSTICA', topics: ['Medidas de Dispersão — Variância e Desvio Padrão','Coeficiente de Variação']},
              { id: 'a-w8-cont', name: 'CONTABILIDADE', topics: ['Estrutura das Demonstrações Contábeis — Lei 6.404/76 e CPC 00','Introdução ao Balanço Patrimonial e DRE']},
              { id: 'a-w8-dc', name: 'DIR. CONSTITUCIONAL', topics: ['Poder Judiciário — Estrutura e Competências do STF e STJ','Competência das Justiças Militares']},
              { id: 'a-w8-da', name: 'DIR. ADMINISTRATIVO', topics: ['Bens Públicos — Classificação e Características','Inalienabilidade, Impenhorabilidade, Formas de Aquisição e Alienação']},
              { id: 'a-w8-dp', name: 'DIR. PENAL', topics: ['Crimes contra a Adm. Pública II — Praticados por Particular','Desobediência, Desacato, Corrupção Ativa e Resistência']}
            ]
          }
        ]
      },
      {
        title: 'Mês 3 — Refinamento de Alta Linha',
        weeks: [
          {
            id: 'a-w9', week: 9, title: 'Semântica Avançada e Ilícitos Administrativos',
            subjects: [
              { id: 'a-w9-pt', name: 'PORTUGUÊS', topics: ['Semântica — Sinonímia, Antonímia, Homonímia e Paronímia','Conotação e Denotação']},
              { id: 'a-w9-rlm', name: 'RLM / MATEMÁTICA', topics: ['Lógica Sequencial — Sequências Numéricas e de Figuras','Sequências Alfabéticas e Padrões de Recorrência']},
              { id: 'a-w9-cont', name: 'CONTABILIDADE', topics: ['Mensuração de Ativos I — Estoques','Critérios de Valoração: PEPS, UEPS e Média Ponderada Móvel']},
              { id: 'a-w9-dc', name: 'DIR. CONSTITUCIONAL', topics: ['Funções Essenciais à Justiça — MP, Advocacia Pública e Defensoria','Controle Externo da Atividade Policial e Fiscal']},
              { id: 'a-w9-da', name: 'DIR. ADMINISTRATIVO', topics: ['Controle da Administração Pública — Controle Interno e Externo','Tribunais de Contas e Limites do Controle Judicial']},
              { id: 'a-w9-dp', name: 'DIR. PENAL', topics: ['Lei de Improbidade Administrativa (Lei 8.429/92)','Natureza Jurídica, Elemento Subjetivo (Dolo) e Sanções']}
            ]
          },
          {
            id: 'a-w10', week: 10, title: 'Retórica, Progressões e Nova Lei de Licitações',
            subjects: [
              { id: 'a-w10-pt', name: 'PORTUGUÊS', topics: ['Vícios de Linguagem mais cobrados','Figuras de Linguagem em interpretação textual complexa']},
              { id: 'a-w10-rlm', name: 'RLM / MATEMÁTICA', topics: ['Progressão Aritmética (PA) — Termo Geral, Soma e Propriedades','Progressão Geométrica (PG) — Termo Geral, Soma e Propriedades']},
              { id: 'a-w10-cont', name: 'CONTABILIDADE', topics: ['Provisões, Passivos Contingentes e Ativos Contingentes (CPC 25)','Tratamento Contábil das Contingências']},
              { id: 'a-w10-dc', name: 'DIR. CONSTITUCIONAL', topics: ['Ordem Econômica e Financeira — Princípios Gerais','Intervenção do Estado no Domínio Econômico']},
              { id: 'a-w10-da', name: 'DIR. ADMINISTRATIVO', topics: ['Licitações Públicas — Lei 14.133/21 — Princípios e Objetivos','Modalidades de Licitação, Inexigibilidade e Dispensa']},
              { id: 'a-w10-dp', name: 'DIR. PENAL', topics: ['Teoria da Pena — Espécies e Regimes de Cumprimento','Critério Trifásico de Fixação da Pena de Nelson Hungria']}
            ]
          },
          {
            id: 'a-w11', week: 11, title: 'Tipologia e Contratos Administrativos',
            subjects: [
              { id: 'a-w11-pt', name: 'PORTUGUÊS', topics: ['Tipologia Textual — Dissertativo-Argumentativo e Expositivo','Gêneros: Narrativo, Descritivo e Injuntivo']},
              { id: 'a-w11-rlm', name: 'MATEMÁTICA FINANCEIRA', topics: ['Conceito de Capital, Juros, Taxa e Montante','Regimes de Capitalização — Juros Simples']},
              { id: 'a-w11-cont', name: 'CONTABILIDADE', topics: ['DRE Avançada — Estrutura Legal','Receita Bruta, Deduções, Lucro Bruto, Despesas Operacionais']},
              { id: 'a-w11-dc', name: 'DIR. CONSTITUCIONAL', topics: ['Finanças Públicas — Normas Gerais e Competência Legislativa','Orçamento Público como Instrumento de Controle Político-Social']},
              { id: 'a-w11-da', name: 'DIR. ADMINISTRATIVO', topics: ['Contratos Administrativos — Lei 14.133/21 — Características','Cláusulas Exorbitantes, Alteração Unilateral e Rescisão']},
              { id: 'a-w11-dp', name: 'DIR. PENAL', topics: ['Extinção da Punibilidade — Prescrição da Pretensão Punitiva e Executória','Decadência, Perempção e Escusas Absolutórias']}
            ]
          },
          {
            id: 'a-w12', week: 12, title: 'Consolidação dos Pilares Base',
            subjects: [
              { id: 'a-w12-pt', name: 'PORTUGUÊS', topics: ['Reescrita de Frases — Substituição de Termos','Transposição de Vozes Verbais e Manutenção do Sentido']},
              { id: 'a-w12-rlm', name: 'MATEMÁTICA FINANCEIRA', topics: ['Juros Compostos — Cálculo de Montante','Equivalência de Taxas Nominais e Efetivas']},
              { id: 'a-w12-cont', name: 'CONTABILIDADE', topics: ['Balanço Patrimonial — Estrutura Avançada, Curto x Longo Prazo','Ajuste a Valor Presente e Ajuste de Avaliação Patrimonial']},
              { id: 'a-w12-dc', name: 'DIR. CONSTITUCIONAL', topics: ['Julgados Recentes e Teses de Repercussão Geral do STF','Organização do Estado e Direitos Fundamentais']},
              { id: 'a-w12-da', name: 'DIR. ADMINISTRATIVO', topics: ['Julgados Recentes e Súmulas do STF/STJ sobre Concursos Públicos','Processo Administrativo e Licitações']},
              { id: 'a-w12-dp', name: 'DIR. PENAL', topics: ['Súmulas do STF e STJ em Matéria Penal','Crimes Funcionais, Princípio da Insignificância e Excludentes']}
            ]
          }
        ]
      }
    ]
  },
  bravo: {
    name: 'Ciclo Bravo',
    months: [
      {
        title: 'Mês 4 — Núcleo Penal Militar e Tributário',
        weeks: [
          {
            id: 'b-w13', week: 13, title: 'Divisor de Águas: Competência e Liberdade',
            subjects: [
              { id: 'b-w13-dpm', name: 'DIR. PENAL MILITAR', topics: ['Conceito de Crime Militar em Tempo de Paz — Art. 9º do CPM','Pós-Lei 13.491/17 — Ampliação para crimes em legislação extravagante']},
              { id: 'b-w13-dpp', name: 'DIR. PROC. PENAL', topics: ['Teoria Geral das Prisões e Prisão em Flagrante (Art. 301 a 310 CPP)','Flagrante Próprio, Impróprio, Presumido, Forjado e Preparado']},
              { id: 'b-w13-dt', name: 'DIR. TRIBUTÁRIO', topics: ['Sistema Tributário Nacional — Limitações Constitucionais','Princípios: Legalidade, Anterioridade, Irretroatividade']},
              { id: 'b-w13-mfe', name: 'MAT. FINANCEIRA / EST.', topics: ['Juros Simples e Compostos — Revisão e Consolidação','Equivalência de Capitais e Fluxos de Caixa']}
            ]
          },
          {
            id: 'b-w14', week: 14, title: 'Coerção Estatal e Competência Fiscal',
            subjects: [
              { id: 'b-w14-dpm', name: 'DIR. PENAL MILITAR', topics: ['Crime de Dormir em Serviço (Art. 203 CPM)','Recusa de Obediência (Art. 163) — Hierarquia x Ordem Manifestamente Ilegal']},
              { id: 'b-w14-dpp', name: 'DIR. PROC. PENAL', topics: ['Prisão Preventiva (Art. 311 a 316 CPP) — Requisitos','Fumus comissi delicti e Periculum libertatis — Pós-Pacote Anticrime']},
              { id: 'b-w14-dt', name: 'DIR. TRIBUTÁRIO', topics: ['Competência Tributária — Distribuição Constitucional','Fato Gerador como Delimitador de Incidência']},
              { id: 'b-w14-mfe', name: 'MAT. FINANCEIRA', topics: ['Descontos Comerciais (Por Fora) — Regimes Simples e Compostos','Descontos Racionais (Por Dentro)']}
            ]
          },
          {
            id: 'b-w15', week: 15, title: 'Concurso de Crimes e Crédito Tributário',
            subjects: [
              { id: 'b-w15-dpm', name: 'DIR. PENAL MILITAR', topics: ['Concurso de Crimes no CPM (Art. 79)','Diferenças com CP Comum: Cúmulo Material, Exasperação e Pena Mais Grave']},
              { id: 'b-w15-dpp', name: 'DIR. PROC. PENAL', topics: ['Inquérito Policial (IP) e Inquérito Policial Militar (IPM)','Características, Prazos, Sigilo e Valor Probatório']},
              { id: 'b-w15-dt', name: 'DIR. TRIBUTÁRIO', topics: ['Crédito Tributário — Constituição via Lançamento','Lançamento por Homologação, Declaração e De Ofício']},
              { id: 'b-w15-mfe', name: 'MAT. FINANCEIRA', topics: ['Rendas/Anuidades — Séries Antecipadas e Postecipadas','Amortização pelos Sistemas SAC e PRICE']}
            ]
          },
          {
            id: 'b-w16', week: 16, title: 'Culpabilidade Militar e Extinção do Crédito',
            subjects: [
              { id: 'b-w16-dpm', name: 'DIR. PENAL MILITAR', topics: ['Causas de Exclusão de Culpabilidade no CPM','Obediência Hierárquica (Art. 38, §2º) e Coação Moral Irresistível']},
              { id: 'b-w16-dpp', name: 'DIR. PROC. PENAL', topics: ['Ação Penal Pública (Condicionada e Incondicionada) e Privada','Condições da Ação, Prazos Decadenciais e ANPP']},
              { id: 'b-w16-dt', name: 'DIR. TRIBUTÁRIO', topics: ['Causas de Extinção do Crédito Tributário (Art. 156 CTN)','Decadência x Prescrição — Diferenças e Termos Iniciais']},
              { id: 'b-w16-mfe', name: 'ESTATÍSTICA AVANÇADA', topics: ['Teorema do Limite Central e Distribuição Normal','Intervalos de Confiança para Médias e Proporções']}
            ]
          }
        ]
      },
      {
        title: 'Mês 5 — Orçamento Público, Contabilidade e Controle',
        weeks: [
          {
            id: 'b-w17', week: 17, title: 'Planejamento Macroeconômico do Estado',
            subjects: [
              { id: 'b-w17-afo', name: 'AFO', topics: ['O Modelo Orçamentário Brasileiro — PPA, LDO e LOA','Princípios Orçamentários e suas Exceções']},
              { id: 'b-w17-cc', name: 'CONT. DE CUSTOS', topics: ['Terminologia — Gasto, Custo, Despesa, Investimento e Perda','Diferenciação precisa entre os conceitos']},
              { id: 'b-w17-aud', name: 'AUDITORIA', topics: ['Normas Brasileiras (NBCTA) e Internacionais — Objetivos Gerais','Ceticismo Profissional e Julgamento Profissional']},
              { id: 'b-w17-cg', name: 'CONTABILIDADE GERAL', topics: ['Mensuração de Ativos II — Operações com Mercadorias','Tratamento dos Tributos Recuperáveis e Não Recuperáveis']}
            ]
          },
          {
            id: 'b-w18', week: 18, title: 'Fluxo Orçamentário e Risco de Auditoria',
            subjects: [
              { id: 'b-w18-afo', name: 'AFO', topics: ['O Ciclo Orçamentário e Créditos Adicionais','Suplementares, Especiais e Extraordinários']},
              { id: 'b-w18-cc', name: 'CONT. DE CUSTOS', topics: ['Classificação de Custos — Diretos, Indiretos, Fixos e Variáveis','Mecanismos de Rateio dos Custos Indiretos de Fabricação (CIF)']},
              { id: 'b-w18-aud', name: 'AUDITORIA', topics: ['Planejamento — Matriz de Risco de Auditoria','Risco Inerente x Risco de Controle x Risco de Detecção — Materialidade']},
              { id: 'b-w18-cg', name: 'CONTABILIDADE GERAL', topics: ['Demonstração dos Fluxos de Caixa (DFC) — Método Direto e Indireto','Classificação: Atividades Operacionais, de Investimento e de Financiamento']}
            ]
          },
          {
            id: 'b-w19', week: 19, title: 'Receita Pública, Métodos de Custeio e Evidências',
            subjects: [
              { id: 'b-w19-afo', name: 'AFO', topics: ['Receita Pública — Conceito e Classificação','Estágios da Receita: Planejamento, Lançamento, Arrecadação e Recolhimento']},
              { id: 'b-w19-cc', name: 'CONT. DE CUSTOS', topics: ['Custeio por Absorção versus Custeio Variável (Direto)','Impacto na Valoração dos Estoques e no Resultado do Exercício']},
              { id: 'b-w19-aud', name: 'AUDITORIA', topics: ['Evidência de Auditoria — Inspeção, Observação, Confirmação Externa','Recálculo, Reexecução e Procedimentos Analíticos']},
              { id: 'b-w19-cg', name: 'CONTABILIDADE GERAL', topics: ['Ajustes de Encerramento do Exercício — Depreciação, Amortização e Exaustão','Critérios de Avaliação de Ativos Intangíveis']}
            ]
          },
          {
            id: 'b-w20', week: 20, title: 'Execução da Despesa e Relatório Final',
            subjects: [
              { id: 'b-w20-afo', name: 'AFO', topics: ['Despesa Pública — Classificação por Natureza e Estrutura Funcional-Programática','Estágios: Fixação, Empenho, Liquidação e Pagamento — Restos a Pagar']},
              { id: 'b-w20-cc', name: 'CONT. DE CUSTOS', topics: ['Análise Custo-Volume-Lucro — Ponto de Equilíbrio','Margem de Contribuição']},
              { id: 'b-w20-aud', name: 'AUDITORIA', topics: ['Opinião do Auditor — Tipos de Relatório','Opinião Modificada x Não Modificada — Ressalva, Abstenção e Opinião Adversa']},
              { id: 'b-w20-cg', name: 'CONTABILIDADE GERAL', topics: ['Investimentos pelo Método da Equivalência Patrimonial (MEP)','Conceito de Coligadas e Controladas — Cálculo do Ganho/Perda']}
            ]
          }
        ]
      },
      {
        title: 'Mês 6 — Integração Avançada e Jurisprudência',
        weeks: [
          {
            id: 'b-w21', week: 21, title: 'LRF e Demonstrações Complexas',
            subjects: [
              { id: 'b-w21-afo', name: 'AFO', topics: ['LRF (LC 101/00) — Anexo de Metas Fiscais e Riscos Fiscais','Receita Corrente Líquida (RCL) e Limites de Gastos com Pessoal']},
              { id: 'b-w21-cc', name: 'CC / CONT. GERAL', topics: ['Demonstração do Valor Adicionado (DVA) — Estrutura e Conceito','Geração e Distribuição de Riqueza']},
              { id: 'b-w21-aud', name: 'AUDITORIA', topics: ['Amostragem em Auditoria — Estatística versus Não Estatística','Riscos de Amostragem: Superconfiança x Subconfiança']},
              { id: 'b-w21-mfe', name: 'ESTATÍSTICA AVANÇADA', topics: ['Testes de Hipóteses','Regressão Linear Simples']}
            ]
          },
          {
            id: 'b-w22', week: 22, title: 'Entroncamento Penal, Processual e Tributário',
            subjects: [
              { id: 'b-w22-dpm', name: 'DIR. PENAL MILITAR / PENAL', topics: ['Crimes Fiscais, Lavagem de Dinheiro e Organizações Criminosas','Aplicação ao Ambiente Militar e à Administração Pública']},
              { id: 'b-w22-dpp', name: 'DIR. PROC. PENAL', topics: ['Teoria Geral da Prova — Provas Ilícitas e Derivadas','Teoria dos Frutos da Árvore Envenenada']},
              { id: 'b-w22-dt', name: 'DIR. TRIBUTÁRIO', topics: ['Responsabilidade Tributária — Por Sucessão, de Terceiros e por Infrações','Súmula 430 STJ — Mero Inadimplemento']},
              { id: 'b-w22-cg', name: 'CONTABILIDADE GERAL', topics: ['Consolidação de Demonstrações Contábeis','Eliminação de Saldos Intercompanhias e Lucros Não Realizados']}
            ]
          },
          {
            id: 'b-w23', week: 23, title: 'Jurisprudência de Vanguarda — STF/STJ',
            subjects: [
              { id: 'b-w23-seg', name: 'CARREIRAS JURÍDICAS / SEGURANÇA', topics: ['Teses de Repercussão Geral STF — Inviolabilidade Domiciliar (Tema 280)','Restrições à Busca Pessoal sem Justa Causa Fundada']},
              { id: 'b-w23-fis', name: 'CARREIRAS FISCAIS / AFO', topics: ['STF — Constitucionalidade das Sanções Políticas em Matéria Tributária','RE 601.314 — Limites de Fiscalização na Quebra de Sigilo Bancário']},
              { id: 'b-w23-dpm', name: 'DIR. PENAL MILITAR', topics: ['STF — Princípio da Insignificância em Crimes Militares','Posse de Substância Entorpecente em Ambiente sob Administração Militar']}
            ]
          },
          {
            id: 'b-w24', week: 24, title: 'Consolidação Operacional do Ciclo Bravo',
            subjects: [
              { id: 'b-w24-disc', name: 'PROVAS DISCURSIVAS', topics: ['Simulação de Provas Discursivas — Carreiras Jurídicas e de Segurança','Peças Práticas e Pareceres Fiscais']},
              { id: 'b-w24-rev', name: 'MAPEAMENTO FINAL', topics: ['Fechamento dos Cadernos de Erros do Ciclo Bravo','Revisão das Métricas — Meta: Taxa de Acertos Global acima de 85%']}
            ]
          }
        ]
      }
    ]
  }
};
const SCHEDULE = {
  alfa: {
    1: [ // Segunda
      { subj: 'Português',          slot: 'Bloco 1 — 60 min' },
      { subj: 'D. Constitucional',  slot: 'Bloco 2 — 60 min' }
    ],
    2: [ // Terça
      { subj: 'RLM / Matemática',   slot: 'Bloco 1 — 60 min' },
      { subj: 'D. Administrativo',  slot: 'Bloco 2 — 60 min' }
    ],
    3: [ // Quarta
      { subj: 'Contabilidade Geral',slot: 'Bloco 1 — 60 min' },
      { subj: 'D. Penal',           slot: 'Bloco 2 — 60 min' }
    ],
    4: [ // Quinta
      { subj: 'Português',          slot: 'Bloco 1 — 60 min' },
      { subj: 'D. Constitucional',  slot: 'Bloco 2 — 60 min' }
    ],
    5: [ // Sexta
      { subj: 'RLM / Matemática',   slot: 'Bloco 1 — 60 min' },
      { subj: 'D. Administrativo',  slot: 'Bloco 2 — 60 min' }
    ],
    6: [ // Sábado
      { subj: 'Contabilidade Geral',slot: 'Bloco 1 — 60 min' },
      { subj: 'D. Penal',           slot: 'Bloco 2 — 60 min' }
    ],
    0: [ // Domingo
      { subj: 'Simulado Geral',     slot: 'Bloco 1 — 60 min' },
      { subj: 'Revisão Ativa',      slot: 'Bloco 2 — 60 min' }
    ]
  },
  bravo: {
    1: [ // Segunda
      { subj: 'D. Tributário',              slot: 'Bloco 1 — 60 min' },
      { subj: 'D. Proc. Penal',             slot: 'Bloco 2 — 60 min' }
    ],
    2: [ // Terça
      { subj: 'Matemática Fin. / Estat.',   slot: 'Bloco 1 — 60 min' },
      { subj: 'AFO',                         slot: 'Bloco 2 — 60 min' }
    ],
    3: [ // Quarta
      { subj: 'Contabilidade Geral',         slot: 'Bloco 1 — 60 min' },
      { subj: 'D. Penal Militar',            slot: 'Bloco 2 — 60 min' }
    ],
    4: [ // Quinta
      { subj: 'D. Tributário',              slot: 'Bloco 1 — 60 min' },
      { subj: 'D. Proc. Penal',             slot: 'Bloco 2 — 60 min' }
    ],
    5: [ // Sexta
      { subj: 'Auditoria / Custos',          slot: 'Bloco 1 — 60 min' },
      { subj: 'AFO',                         slot: 'Bloco 2 — 60 min' }
    ],
    6: [ // Sábado
      { subj: 'Simulado de Questões',        slot: 'Bloco 1 — 60 min' },
      { subj: 'Revisão de Engenharia',       slot: 'Bloco 2 — 60 min' }
    ],
    0: [ // Domingo
      { subj: 'Simulado Total',              slot: 'Bloco 1 — 60 min' },
      { subj: 'Análise de Métricas',         slot: 'Bloco 2 — 60 min' }
    ]
  }
};

let currentCycle = null;
let currentWeek = null;

// Add 'questoes' to studyProgress if it doesn't exist
// structure: studyProgress.questoes = { "2026-07-06": { alfa: { "Português": 10 } } }

// ── MISSIONS ACCORDION LOGIC ──

function selectCycle(cycleId) {
    currentCycle = cycleId;
    currentWeek = null;
    
    // UI Update
    document.getElementById('btn-alfa').className = `flex-1 py-3 rounded-xl border font-bold font-mono transition ${cycleId === 'alfa' ? 'bg-axys-accent/20 border-axys-accent text-axys-accent' : 'bg-axys-surface2 border-white/5 text-axys-textMuted'}`;
    document.getElementById('btn-bravo').className = `flex-1 py-3 rounded-xl border font-bold font-mono transition ${cycleId === 'bravo' ? 'bg-axys-accent/20 border-axys-accent text-axys-accent' : 'bg-axys-surface2 border-white/5 text-axys-textMuted'}`;
    
    const wContainer = document.getElementById('weeks-container');
    const tContainer = document.getElementById('topics-container');
    
    wContainer.classList.remove('hidden');
    tContainer.classList.add('hidden');
    
    const weeksData = CYCLES[cycleId].months[0].weeks; // Assuming month 1 for simplicity, can be expanded
    
    wContainer.innerHTML = weeksData.map(w => `
        <button onclick="selectWeek('${w.id}')" id="btn-week-${w.id}" class="py-2 rounded-lg bg-axys-surface2 border border-white/5 text-xs font-bold font-mono text-axys-textMuted hover:border-axys-accent transition">
            S0${w.week}
        </button>
    `).join('');
}

function selectWeek(weekId) {
    currentWeek = weekId;
    const wContainer = document.getElementById('weeks-container');
    Array.from(wContainer.children).forEach(btn => {
        btn.classList.replace('bg-axys-accent', 'bg-axys-surface2');
        btn.classList.replace('text-black', 'text-axys-textMuted');
    });
    
    const activeBtn = document.getElementById(`btn-week-${weekId}`);
    activeBtn.classList.replace('bg-axys-surface2', 'bg-axys-accent');
    activeBtn.classList.replace('text-axys-textMuted', 'text-black');
    
    const tContainer = document.getElementById('topics-container');
    tContainer.classList.remove('hidden');
    
    const weeksData = CYCLES[currentCycle].months[0].weeks;
    const week = weeksData.find(w => w.id === weekId);
    
    tContainer.innerHTML = week.subjects.map(subj => {
        return `
        <div class="bg-axys-surface2 rounded-xl p-3 border border-white/5">
            <div class="font-bold text-sm text-axys-accent mb-2 font-mono">${subj.name}</div>
            <div class="space-y-2">
                ${subj.topics.map((top, idx) => {
                    const topicKey = `${weekId}-${subj.id}-${idx}`;
                    const isChecked = studyProgress.boxes && studyProgress.boxes[topicKey];
                    return `
                    <label class="flex items-start gap-3 cursor-pointer group">
                        <div class="mt-0.5 w-5 h-5 rounded border border-axys-textMuted flex items-center justify-center group-hover:border-axys-accent transition ${isChecked ? 'bg-axys-accent border-axys-accent' : ''}">
                            <i class="ph-bold ph-check text-black text-xs ${isChecked ? 'block' : 'hidden'}"></i>
                        </div>
                        <input type="checkbox" class="hidden" ${isChecked ? 'checked' : ''} onchange="toggleTheoryTopic('${topicKey}')">
                        <span class="text-xs flex-1 ${isChecked ? 'text-axys-textMuted line-through' : 'text-white'}">${top}</span>
                    </label>
                    `;
                }).join('')}
            </div>
        </div>
        `;
    }).join('');
}

async function toggleTheoryTopic(topicKey) {
    if(!studyProgress.boxes) studyProgress.boxes = {};
    studyProgress.boxes[topicKey] = !studyProgress.boxes[topicKey];
    
    // Save state but do NOT give XP! Theory check is just visual progress.
    await saveStudyProgress();
    selectWeek(currentWeek); // re-render
}


// ── CALENDAR & DAILY QUESTIONS LOGIC ──
let currentCalDate = new Date();
let selectedDailyDate = null;
let currentDailyCycle = 'alfa';

function renderCalendar() {
    const y = currentCalDate.getFullYear();
    const m = currentCalDate.getMonth();
    
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    document.getElementById('cal-month-year').textContent = `${monthNames[m]} ${y}`;
    
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    
    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';
    
    // Empty slots
    for(let i=0; i<firstDay; i++) {
        grid.innerHTML += `<div></div>`;
    }
    
    const today = new Date();
    
    // Days
    for(let d=1; d<=daysInMonth; d++) {
        const dStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isToday = (d === today.getDate() && m === today.getMonth() && y === today.getFullYear());
        
        // Check if there are questions solved that day
        let totalQ = 0;
        if(studyProgress.questoes && studyProgress.questoes[dStr]) {
            Object.values(studyProgress.questoes[dStr]).forEach(cycle => {
                Object.values(cycle).forEach(q => totalQ += q);
            });
        }
        
        const hasGoal = totalQ >= 50; // Example goal
        
        grid.innerHTML += `
            <div onclick="openDailyModal('${dStr}')" class="aspect-square flex flex-col items-center justify-center rounded-lg cursor-pointer transition ${isToday ? 'border-2 border-axys-accent text-axys-accent font-bold' : 'bg-axys-surface2 hover:bg-axys-surface'}">
                <span class="text-sm">${d}</span>
                ${totalQ > 0 ? `<div class="w-1.5 h-1.5 rounded-full mt-1 ${hasGoal ? 'bg-axys-accent shadow-[0_0_5px_#4DEEEA]' : 'bg-yellow-500'}"></div>` : ''}
            </div>
        `;
    }
}

function changeMonth(delta) {
    currentCalDate.setMonth(currentCalDate.getMonth() + delta);
    renderCalendar();
}

function openDailyModal(dateStr) {
    selectedDailyDate = dateStr;
    const parts = dateStr.split('-');
    const dt = new Date(parts[0], parts[1]-1, parts[2]);
    const days = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    document.getElementById('daily-date-title').textContent = `${parts[2]}/${parts[1]} — ${days[dt.getDay()]}`;
    
    setDailyCycle('alfa'); // Default
    
    document.getElementById('modal-backdrop').classList.remove('hidden');
    document.getElementById('modal-daily').classList.remove('translate-y-full');
}

function setDailyCycle(cycle) {
    currentDailyCycle = cycle;
    document.getElementById('btn-daily-alfa').className = `flex-1 py-2 rounded-lg font-bold text-sm transition ${cycle === 'alfa' ? 'bg-axys-accent text-black' : 'text-axys-textMuted'}`;
    document.getElementById('btn-daily-bravo').className = `flex-1 py-2 rounded-lg font-bold text-sm transition ${cycle === 'bravo' ? 'bg-axys-accent text-black' : 'text-axys-textMuted'}`;
    renderDailySubjects();
}

function renderDailySubjects() {
    const parts = selectedDailyDate.split('-');
    const dt = new Date(parts[0], parts[1]-1, parts[2]);
    const dow = dt.getDay(); // 0 = Domingo
    
    const subjectsForDay = SCHEDULE[currentDailyCycle][dow] || [];
    
    if(!studyProgress.questoes) studyProgress.questoes = {};
    if(!studyProgress.questoes[selectedDailyDate]) studyProgress.questoes[selectedDailyDate] = { alfa: {}, bravo: {} };
    
    // Calc total Qs for the day
    let totalQ = 0;
    Object.values(studyProgress.questoes[selectedDailyDate]).forEach(c => {
        Object.values(c).forEach(q => totalQ += q);
    });
    
    document.getElementById('daily-q-total').textContent = totalQ;
    const goalEl = document.getElementById('daily-q-total').parentElement;
    if(totalQ >= 50) {
        goalEl.classList.replace('text-axys-accent', 'text-yellow-400');
        goalEl.innerHTML = `Meta: <span id="daily-q-total">${totalQ}</span> / 50 <i class="ph-fill ph-fire ml-1"></i>`;
    } else {
        goalEl.classList.replace('text-yellow-400', 'text-axys-accent');
        goalEl.innerHTML = `Meta: <span id="daily-q-total">${totalQ}</span> / 50`;
    }

    const list = document.getElementById('daily-subjects-list');
    list.innerHTML = subjectsForDay.map(s => {
        const subjName = s.subj;
        const count = studyProgress.questoes[selectedDailyDate][currentDailyCycle][subjName] || 0;
        return `
        <div class="bg-axys-surface2 p-3 rounded-xl border border-white/5 flex flex-col gap-2">
            <div class="text-xs text-axys-textMuted">${s.slot}</div>
            <div class="font-bold text-sm text-white">${subjName}</div>
            <div class="flex items-center justify-between mt-2 bg-axys-bg rounded-lg p-1">
                <button onclick="changeQ('${subjName}', -5)" class="w-8 h-8 rounded text-axys-danger hover:bg-axys-surface transition">-5</button>
                <button onclick="changeQ('${subjName}', -1)" class="w-8 h-8 rounded text-axys-danger hover:bg-axys-surface transition">-1</button>
                <div class="font-bold font-mono text-lg w-10 text-center text-axys-accent">${count}</div>
                <button onclick="changeQ('${subjName}', 1)" class="w-8 h-8 rounded text-axys-success hover:bg-axys-surface transition">+1</button>
                <button onclick="changeQ('${subjName}', 5)" class="w-8 h-8 rounded text-axys-success hover:bg-axys-surface transition">+5</button>
            </div>
        </div>
        `;
    }).join('');
}

async function changeQ(subjName, delta) {
    if(!studyProgress.questoes[selectedDailyDate]) studyProgress.questoes[selectedDailyDate] = { alfa: {}, bravo: {} };
    if(!studyProgress.questoes[selectedDailyDate][currentDailyCycle]) studyProgress.questoes[selectedDailyDate][currentDailyCycle] = {};
    
    let cur = studyProgress.questoes[selectedDailyDate][currentDailyCycle][subjName] || 0;
    let next = Math.max(0, cur + delta);
    
    const diff = next - cur;
    if(diff === 0) return;
    
    studyProgress.questoes[selectedDailyDate][currentDailyCycle][subjName] = next;
    
    // GRANT XP ONLY FOR POSITIVE INCREASES (1 questao = 1 XP)
    if(diff > 0) {
        studyProgress.total_xp += diff;
        studyProgress.available_xp += diff;
    } else {
        // if user decreases, deduct xp to be fair
        studyProgress.total_xp += diff;
        studyProgress.available_xp += diff;
    }
    
    renderDailySubjects();
    renderHeader();
    renderCalendar(); // update dot
    
    // Background save to avoid lag
    sb.from('study_progress').upsert({
        user_id: user.id,
        total_xp: studyProgress.total_xp,
        available_xp: studyProgress.available_xp,
        questoes: studyProgress.questoes,
        boxes: studyProgress.boxes,
        updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
}

// Override modal closer
const oldClose = closeAllModals;
closeAllModals = function() {
    oldClose();
    document.getElementById('modal-daily').classList.add('translate-y-full');
}
