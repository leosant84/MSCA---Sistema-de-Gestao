-- ==============================================================================
-- MSCA - Criar / Cadastrar Usuário Colaborador
-- Email: leonardo@msca.com.br
-- Role: colaborador
-- ==============================================================================

DO $$
DECLARE
    new_user_id UUID := gen_random_uuid();
    user_email TEXT := 'leonardo@msca.com.br';
    user_pass TEXT := 'MscaColab@2026'; -- Defina a senha inicial desejada aqui
    user_name TEXT := 'Leonardo';
BEGIN
    -- 1. Verifica se o usuário já existe em auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
        -- Insere na tabela de autenticação do Supabase
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            new_user_id,
            'authenticated',
            'authenticated',
            user_email,
            crypt(user_pass, gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('full_name', user_name),
            now(),
            now(),
            encode(gen_random_bytes(32), 'hex'),
            encode(gen_random_bytes(32), 'hex')
        );

        -- Cria entrada de identidade para permitir login por email/senha
        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            new_user_id,
            new_user_id,
            format('{"sub":"%s","email":"%s"}', new_user_id::text, user_email)::jsonb,
            'email',
            now(),
            now(),
            now()
        );
    END IF;

    -- 2. Garante o registro e a role 'colaborador' na tabela public.profiles
    INSERT INTO public.profiles (id, email, full_name, role)
    SELECT id, email, user_name, 'colaborador'::user_role
    FROM auth.users
    WHERE email = user_email
    ON CONFLICT (id) DO UPDATE
    SET role = 'colaborador',
        full_name = EXCLUDED.full_name;

    RAISE NOTICE 'Usuário colaborador % configurado com sucesso!', user_email;
END $$;

-- 3. Consulta de conferência
SELECT id, email, full_name, role, created_at 
FROM public.profiles 
WHERE email = 'leonardo@msca.com.br';
