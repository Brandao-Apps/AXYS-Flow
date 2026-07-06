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
    renderTasks();
    toast('Missão criada!');
}

async function completeTask(id, xp_reward) {
    const taskIndex = tasks.findIndex(t => t.id === id);
    if(taskIndex === -1) return;
    
    tasks[taskIndex].is_completed = true;
    await sb.from('tasks').update({ is_completed: true }).eq('id', id);
    
    addXP(xp_reward);
    renderTasks();
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
    renderTasks();
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

function renderTasks() {
    // 1. Elite Cycle (Simulated 4 blocks for simplicity, user can adapt)
    const elite = document.getElementById('elite-cycle-container');
    const blocks = ['Alfa 1', 'Alfa 2', 'Bravo 1', 'Bravo 2'];
    elite.innerHTML = blocks.map(b => {
        const isDone = studyProgress.boxes && studyProgress.boxes[b];
        return `
        <div onclick="toggleEliteBlock('${b}')" class="p-3 rounded-xl cursor-pointer border transition flex flex-col items-center ${isDone ? 'bg-axys-accent/20 border-axys-accent text-axys-accent' : 'bg-axys-surface2 border-white/5 text-axys-textMuted'}">
            <i class="${isDone ? 'ph-fill ph-check-circle' : 'ph ph-circle'} text-2xl mb-1"></i>
            <span class="text-xs font-bold">${b}</span>
        </div>
        `;
    }).join('');

    // 2. Daily Tasks
    const list = document.getElementById('tasks-list');
    const pending = tasks.filter(t => !t.is_completed);
    if(pending.length === 0) {
        list.innerHTML = '<div class="text-sm text-axys-textMuted p-4 text-center">Sem tarefas hoje.</div>';
    } else {
        list.innerHTML = pending.map(t => `
             <div class="flex items-center gap-3 bg-axys-surface2 p-3 rounded-xl border border-white/5">
                <button onclick="completeTask('${t.id}', ${t.xp_reward})" class="w-6 h-6 rounded-full border-2 border-axys-textMuted flex items-center justify-center hover:border-axys-accent transition">
                    <div class="w-3 h-3 rounded-full bg-transparent hover:bg-axys-accent transition"></div>
                </button>
                <div class="flex-1 text-sm font-bold">${t.title}</div>
                <div class="text-xs text-axys-accent font-bold bg-axys-surface px-2 py-1 rounded">+${t.xp_reward}</div>
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
    renderTasks();
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
