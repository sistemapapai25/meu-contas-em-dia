-- Migration to promote user andrielle.alvess to ADMIN
-- Based on the requirement that "andrielle.alvess" should have access to all screens.
-- Fixed enum casing (ADMIN instead of admin).

DO $$
DECLARE
    -- The partial email provided by the user. 
    -- We use ILIKE to match case-insensitively and % to match full email.
    target_partial_email text := 'andrielle.alvess'; 
    v_user_id uuid;
BEGIN
    -- Find user ID by email
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email ILIKE '%' || target_partial_email || '%'
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        -- The application logic (useUserRole.tsx) uses .single() which expects exactly one role per user.
        -- Therefore, we must remove any existing role before assigning the new one.
        DELETE FROM public.user_roles WHERE user_id = v_user_id;
        
        -- Insert the ADMIN role (using uppercase as per app_role enum definition)
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_user_id, 'ADMIN');
        
        RAISE NOTICE 'User % promoted to ADMIN', v_user_id;
    ELSE
        RAISE NOTICE 'User with email containing % not found', target_partial_email;
    END IF;
END $$;
