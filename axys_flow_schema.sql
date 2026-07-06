
-- ==========================================
-- AXYS FLOW: BANCO DE DADOS (SUPABASE)
-- ==========================================

-- 1. Tabela: tasks (Missões Diárias)
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    xp_reward INTEGER DEFAULT 10,
    is_completed BOOLEAN DEFAULT false,
    due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabela: rewards (Loja de Recompensas)
CREATE TABLE IF NOT EXISTS public.rewards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    xp_cost INTEGER NOT NULL,
    icon TEXT DEFAULT '🎁',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela: reward_history (Histórico de Gastos de XP)
CREATE TABLE IF NOT EXISTS public.reward_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    reward_title TEXT NOT NULL,
    xp_spent INTEGER NOT NULL,
    redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Atualizar study_progress (Adicionar XP Gastável)
-- O AXYS Flow gerencia as finanças (users_profile, transactions, categories) e os estudos (study_progress).
-- Como o estudo usa a coluna 'total_xp', vamos adicionar 'available_xp' para a economia do jogo.
ALTER TABLE public.study_progress ADD COLUMN IF NOT EXISTS available_xp INTEGER DEFAULT 0;

-- OBSERVAÇÃO: As tabelas users_profile, categories, e transactions já devem existir pelo uso do AXYS Finance.
-- A tabela study_progress já deve existir pelo uso do Protocolo Elite.
