#!/usr/bin/env python3
"""PR378 r2 probe: prod-faithful schema (prod profiles RLS/triggers/grants + prod template/inspection/JHA policies) + 088 + 089.
Client cases run as SET ROLE authenticated with request.jwt.claims (Supabase auth.uid()).
usage: suite2.py PGVER VARIANT [MIG089_PATH|-] [OUT_JSON] [ONLY_IDS_COMMA]   VARIANT in base|089|alt"""
import shutil, subprocess, sys, json, os
HERE=os.path.dirname(os.path.abspath(__file__))
REPO=os.environ.get('REPO','/workspace')
M088=f'{REPO}/supabase/migrations/20261019010000_088_update_member_settings.sql'
M089=f'{REPO}/supabase/migrations/20261019020000_089_profile_self_escalation_and_template_rls.sql'
PGV=sys.argv[1]; VARIANT=sys.argv[2]
MIG089=sys.argv[3] if len(sys.argv)>3 and sys.argv[3]!='-' else M089
OUT=sys.argv[4] if len(sys.argv)>4 and sys.argv[4]!='-' else None
ONLY=set(sys.argv[5].split(',')) if len(sys.argv)>5 else None
PSQL=shutil.which('psql') or f'/usr/lib/postgresql/{PGV}/bin/psql'
PGHOST=os.environ.get('PGHOST', f'/tmp/pg378r2-{PGV}')
PGPORT=os.environ.get('PGPORT', os.environ.get('PROOF_PGPORT', f'554{PGV}'))
BASE=[PSQL,'-h',PGHOST,'-p',str(PGPORT),'-U','postgres','-X','-q','-t','-A','-v','ON_ERROR_STOP=1']
DB=f'r2_{VARIANT}_{os.getpid()}'
OA='11111111-1111-1111-1111-111111111111'; AA='33333333-3333-3333-3333-333333333333'; MA='44444444-4444-4444-4444-444444444444'; MN='44444444-4444-4444-4444-444444444445'
OB='22222222-2222-2222-2222-222222222222'; MB='55555555-5555-5555-5555-555555555555'; OC='70000000-0000-0000-0000-000000000001'
COA='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; COB='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
CM1='66666666-6666-6666-6666-666666666666'; CMB='77777777-7777-7777-7777-777777777777'
T1='a1000000-0000-4000-8000-000000000001'; JT1='a2000000-0000-4000-8000-000000000001'; JOB='a4000000-0000-4000-8000-000000000001'
I_FULL='a5000000-0000-4000-8000-000000000001'
def psql(sql, db=None):
    p=subprocess.run(BASE+['-d',db or DB],input=sql,capture_output=True,text=True)
    return p.returncode==0, p.stdout.strip(), p.stderr.strip().replace('\n',' ')
def pre(uid, role='authenticated', local=False):
    claims=json.dumps({'sub':uid,'role':role}) if uid else json.dumps({'role':role})
    kw='SET LOCAL' if local else 'SET'
    return f"{kw} request.jwt.claims TO '{claims}'; {kw} ROLE {role};\n"
def run(sql, uid=None, role='authenticated'): return psql((pre(uid,role) if role else '')+sql)
def q(sql):
    ok,out,err=psql(sql); assert ok, err; return out
def load(path): q(open(path).read())
def setup():
    psql(f'DROP DATABASE IF EXISTS {DB}','postgres'); ok,o,e=psql(f'CREATE DATABASE {DB}','postgres'); assert ok,e
    load(f'{HERE}/sql/prod-schema.sql'); load(M088); load(f'{HERE}/sql/field-schema.sql')
    if VARIANT in ('089','alt'): load(MIG089)
    if VARIANT=='alt': load(f'{HERE}/sql/alt-templates-policy.sql')
SEED=open(f'{HERE}/sql/seed.sql').read()+'\n'+open(f'{HERE}/sql/field-seed.sql').read()
def seed(): q(SEED)
def rpc(member, patch): return f"SELECT public.update_member_settings('{member}'::uuid, '{patch}'::jsonb);"
def prof(mid,col): return q(f"SELECT coalesce({col}::text,'NULL') FROM public.profiles WHERE id='{mid}'")
def fail(r, needle=None):
    ok,out,err=r
    return (not ok) and (needle is None or needle.lower() in err.lower()), (err[:170] if not ok else 'NO ERROR: '+out[:150])
CASES=[]
def case(cid, desc, variants=('base','089','alt')):
    def deco(fn): CASES.append((cid,desc,variants,fn)); return fn
    return deco
SELF_MSG="You can't change your own access settings"
@case('T1','none tech self-edits name + licence_number (prod has no phone column)')
def _():
    ok,out,err=run(f"UPDATE public.profiles SET name='Renamed', licence_number='EC1' WHERE id='{MN}' RETURNING name;",MN)
    return ok and out=='Renamed' and prof(MN,'licence_number')=='EC1', out or err
for col,val in [('role',"'admin'"),('template_access',"'edit'"),('expense_cost_model_id',f"'{CM1}'"),('company_id',f"'{COB}'")]:
    def mk(col=col,val=val):
        def f():
            before=prof(MN,col)
            p,d=fail(run(f"UPDATE public.profiles SET {col}={val} WHERE id='{MN}';",MN), SELF_MSG)
            return p and prof(MN,col)==before, d
        return f
    case(f'T2_{col}',f'self-escalation of {col} (PostgREST-style PATCH as authenticated) raises exact text, value unchanged',('089','alt'))(mk())
@case('T2_base_hole','BASE (no 089): none member self-PATCHes template_access none->edit (r1 hole h1)',('base',))
def _():
    ok,out,err=run(f"UPDATE public.profiles SET template_access='edit' WHERE id='{MN}' RETURNING template_access;",MN)
    return ok and out=='edit', 'HOLE reproduced: '+(out or err)
@case('T3','authenticated: SET LOCAL app.member_admin=on + set_config(...,true) in-txn, then self-escalate -> raises',('089','alt'))
def _():
    p,d=fail(run(f"BEGIN; SET LOCAL app.member_admin='on'; SELECT set_config('app.member_admin','on',true); UPDATE public.profiles SET template_access='edit' WHERE id='{MN}'; COMMIT;",MN),SELF_MSG)
    return p and prof(MN,'template_access')=='none', d
@case('T4','session-level SET app.member_admin=on (stale pooled conn) + flag in request.jwt.claims + request.headers -> raises',('089','alt'))
def _():
    claims=json.dumps({'sub':MN,'role':'authenticated','app.member_admin':'on','app_metadata':{'member_admin':'on'}})
    p,d=fail(psql(f"SET app.member_admin='on'; SET request.jwt.claims TO '{claims}'; SET request.headers TO '{{\"x-app-member-admin\":\"on\"}}'; SET ROLE authenticated; UPDATE public.profiles SET role='admin' WHERE id='{MN}';"),SELF_MSG)
    return p and prof(MN,'role')=='member', d
@case('T5','authenticated cannot INSERT its own txid into the gate',('089','alt'))
def _():
    p,d=fail(run("INSERT INTO public.update_member_settings_gate(txid) VALUES (txid_current());",MN),'permission denied'); return p, d
@case('T6','authenticated cannot SELECT/DELETE the gate; anon cannot SELECT',('089','alt'))
def _():
    a=fail(run("SELECT count(*) FROM public.update_member_settings_gate;",MN),'permission denied')
    b=fail(run("DELETE FROM public.update_member_settings_gate;",MN),'permission denied')
    c=fail(run("SELECT count(*) FROM public.update_member_settings_gate;",None,'anon'),'permission denied')
    return a[0] and b[0] and c[0], a[1][:70]
@case('T7','no lingering bypass: owner RPC succeeds, then SAME txn owner self cost-model UPDATE -> raises (flag still on, gate row gone)',('089','alt'))
def _():
    ok,out,err=psql(pre(OA)+"BEGIN; "+rpc(MA,'{"template_access":"none"}')+f" SELECT 'flag='||current_setting('app.member_admin',true); UPDATE public.profiles SET expense_cost_model_id='{CM1}' WHERE id='{OA}'; COMMIT;")
    return (not ok) and SELF_MSG in err and prof(OA,'expense_cost_model_id')=='NULL' and prof(MA,'template_access')=='view', err[:150]
@case('T8','member RPC refused (caught) then same txn self-escalation -> raises (gate never armed)',('089','alt'))
def _():
    ok,out,err=psql(pre(MN)+f"BEGIN; DO $$BEGIN PERFORM public.update_member_settings('{MN}','{{\"template_access\":\"edit\"}}'); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'caught %',SQLERRM; END$$; UPDATE public.profiles SET template_access='edit' WHERE id='{MN}'; COMMIT;")
    return (not ok) and SELF_MSG in err and prof(MN,'template_access')=='none', err[:150]
@case('T9','pooling: ONE backend, 60 txns (owner RPC / admin RPC / member self-escalation attempt, SET LOCAL claims each) -> RPCs never brick, all escalations refused, gate empty',('089','alt'))
def _():
    s=[]
    for i in range(20):
        s.append("BEGIN;"+pre(OA,local=True)+rpc(MA,'{"template_access":"%s"}'%('none' if i%2 else 'edit'))+"COMMIT;")
        s.append("BEGIN;"+pre(AA,local=True)+rpc(MN,'{"expense_cost_model_id":%s}'%('null' if i%2 else '"%s"'%CM1))+"COMMIT;")
        s.append("BEGIN;"+pre(MN,local=True)+f"DO $$BEGIN UPDATE public.profiles SET template_access='edit' WHERE id='{MN}'; RAISE EXCEPTION 'ESCALATED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='ESCALATED' THEN RAISE; END IF; END$$; COMMIT;")
    s.append("RESET ROLE; SELECT 'gate='||count(*) FROM public.update_member_settings_gate;")
    ok,out,err=psql('\n'.join(s))
    return ok and out.endswith('gate=0') and prof(MN,'template_access')=='none' and prof(MA,'template_access')=='none' and prof(MN,'expense_cost_model_id')=='NULL', (out[-40:] if ok else err[:150])
@case('T10','failing RPC (bad cost model) leaves no gate row on the backend',('089','alt'))
def _():
    ok,out,err=psql(pre(OA)+rpc(MA,'{"expense_cost_model_id":"%s"}'%CMB)+"\n")
    out2=q("SELECT count(*) FROM public.update_member_settings_gate;")
    return (not ok) and 'Cost model not found' in err and out2=='0', err[:60]+' gate='+out2
@case('T11','service_role (invite-user adminClient; auth.uid() NULL) UPDATE template_access/role succeeds',('089','alt'))
def _():
    ok,out,err=run(f"UPDATE public.profiles SET template_access='edit', name='Invitee' WHERE id='{MN}' RETURNING template_access;",None,'service_role')
    return ok and out=='edit', out or err
@case('T12','postgres session, no claims (migration / SQL editor) updates access columns',('089','alt'))
def _():
    ok,out,err=psql(f"UPDATE public.profiles SET template_access='edit' WHERE id='{MN}' RETURNING template_access;"); return ok and out=='edit', out or err
@case('T13','admin cannot self-change own template_access by direct UPDATE (must use RPC)',('089','alt'))
def _():
    p,d=fail(run(f"UPDATE public.profiles SET template_access='view' WHERE id='{AA}';",AA),SELF_MSG); return p and prof(AA,'template_access')=='edit', d
@case('T14','owner A direct UPDATE of a member template_access: not the trigger (keyed on auth.uid()), RLS gives 0 rows',('089','alt'))
def _():
    ok,out,err=run(f"WITH u AS (UPDATE public.profiles SET template_access='edit' WHERE id='{MN}' RETURNING 1) SELECT count(*) FROM u;",OA)
    return ok and out=='0' and prof(MN,'template_access')=='none', out or err
@case('R1','089 RPC body: A owner puts B cost model on A member -> Cost model not found (S8)',('089','alt'))
def _():
    p,d=fail(run(rpc(MA,'{"expense_cost_model_id":"%s"}'%CMB),OA),'Cost model not found'); return p and prof(MA,'expense_cost_model_id')=='NULL', d
@case('R2','089 RPC body: A admin on B member -> Not allowed',('089','alt'))
def _():
    p,d=fail(run(rpc(MB,'{"template_access":"none"}'),AA),'Not allowed'); return p and prof(MB,'template_access')=='view', d
@case('R3','089 RPC body: role owner -> Invalid role',('089','alt'))
def _():
    p,d=fail(run(rpc(MA,'{"role":"owner"}'),OA),'Invalid role'); return p and prof(MA,'role')=='member', d
@case('R4','089 RPC body: admin changes role -> Only the company owner can change roles',('089','alt'))
def _():
    p,d=fail(run(rpc(MA,'{"role":"admin"}'),AA),'Only the company owner can change roles'); return p and prof(MA,'role')=='member', d
@case('R5','089 RPC body: owner own role -> You cannot change your own role',('089','alt'))
def _():
    p,d=fail(run(rpc(OA,'{"role":"member"}'),OA),'You cannot change your own role'); return p, d
@case('R6','089 RPC body: 0-row -> No member settings were updated',('089','alt'))
def _():
    q(f"CREATE FUNCTION public.zz_skip() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL; END$$; CREATE TRIGGER zz_skip BEFORE UPDATE ON public.profiles FOR EACH ROW WHEN (OLD.id='{MA}') EXECUTE FUNCTION public.zz_skip();")
    try: p,d=fail(run(rpc(MA,'{"template_access":"none"}'),OA),'No member settings were updated')
    finally: q("DROP TRIGGER zz_skip ON public.profiles; DROP FUNCTION public.zz_skip();")
    return p and prof(MA,'template_access')=='view', d
@case('R7','089 RPC: owner sets none member to edit + cost model through all prod triggers; another admin reads it back via get_company_members',('089','alt'))
def _():
    ok,out,err=run(rpc(MN,'{"template_access":"edit","expense_cost_model_id":"%s"}'%CM1),OA)
    ok2,out2,err2=run(f"SELECT template_access||'/'||expense_cost_model_id FROM public.get_company_members('{COA}') WHERE id='{MN}';",AA)
    return ok and ok2 and out2==f'edit/{CM1}', (out2 or err or err2)
@case('R8','089 RPC: admin sets cost model on a none member; access stays none',('089','alt'))
def _():
    ok,out,err=run(rpc(MN,'{"expense_cost_model_id":"%s"}'%CM1),AA); return ok and prof(MN,'template_access')=='none' and prof(MN,'expense_cost_model_id')==CM1, out or err
@case('R9','089 RPC: owner promotes member to admin',('089','alt'))
def _():
    ok,out,err=run(rpc(MA,'{"role":"admin"}'),OA); return ok and prof(MA,'role')=='admin', out or err
@case('R10','089 RPC: company C only-admin demotion still refused by prod trigger',('089','alt'))
def _():
    p,d=fail(run(rpc('70000000-0000-0000-0000-000000000002','{"role":"member"}'),OC),'at least one admin'); return p, d
@case('R11','089 RPC: secdef, search_path pinned, EXECUTE authenticated only (anon/PUBLIC no)',('089','alt'))
def _():
    out=q("SELECT p.prosecdef||'|'||array_to_string(p.proconfig,',')||'|'||has_function_privilege('anon',p.oid,'execute')||'|'||has_function_privilege('authenticated',p.oid,'execute') FROM pg_proc p WHERE oid='public.update_member_settings(uuid,jsonb)'::regprocedure")
    return out=='true|search_path=public, pg_temp|false|true', out
@case('R12','089 RPC: authenticated without sub -> Not authenticated',('089','alt'))
def _():
    p,d=fail(run(rpc(MA,'{"template_access":"edit"}'),None),'Not authenticated'); return p, d
@case('H1','hoursToJobBill read: member via get_company_members sees colleague cost model; direct profiles select sees only self')
def _():
    q(f"SET session_replication_role=replica; UPDATE public.profiles SET expense_cost_model_id='{CM1}' WHERE id='{AA}';")
    ok,out,err=run(f"SELECT count(*) FILTER (WHERE expense_cost_model_id IS NOT NULL)||'/'||count(*) FROM public.get_company_members('{COA}');",MA)
    ok2,out2,_=run(f"SELECT count(*) FROM public.profiles WHERE company_id='{COA}';",MA)
    return ok and out=='1/4' and out2=='1', f'rpc={out or err} direct={out2}'
def tsel(uid, sql): ok,out,err=run(sql,uid); return out if ok else 'ERR '+err[:80]
I_LEGACY='a5000000-0000-4000-8000-000000000002'
for who,uid in [('none',MN),('view',MA),('admin',AA)]:
    def mkf(who=who,uid=uid):
        @case(f'F1_{who}',f'{who}: NewInspectionPage template picker')
        def _():
            out=tsel(uid,"SELECT count(*) FROM public.templates WHERE archived=false;")
            return out=='2', 'rows='+out
        @case(f'F2_{who}',f'{who}: create inspection on job (snapshot from picker row, INSERT)')
        def _():
            ok,out,err=run(f"""WITH t AS (SELECT id,name,report_renderer,schema FROM public.templates WHERE id='{T1}')
              INSERT INTO public.inspections(template_id,template_snapshot,inspector_id,crm_job_id)
              SELECT id, jsonb_build_object('id',id,'name',name,'report_renderer',report_renderer,'schema',schema), auth.uid(), '{JOB}' FROM t RETURNING id;""",uid)
            return bool(ok and out), ('created' if ok and out else ('no template row -> nothing to create' if ok else 'ERR '+err[:80]))
        @case(f'F3_{who}',f'{who}: fill + complete own job inspection (snapshot has schema) and read it for report')
        def _():
            iid=I_FULL
            if who!='none':
                iid=q(f"INSERT INTO public.inspections(template_id,template_snapshot,inspector_id,crm_job_id) VALUES ('{T1}','{{\"schema\":{{\"sections\":[]}}}}','{uid}','{JOB}') RETURNING id").split('\n')[0]
            ok,out,err=run(f"UPDATE public.inspections SET responses='{{\"q1\":\"yes\"}}', status='completed' WHERE id='{iid}' RETURNING (template_snapshot ? 'schema')::text;",uid)
            r=tsel(uid,f"SELECT (template_snapshot->>'report_renderer') IS NOT NULL OR template_snapshot ? 'schema' FROM public.inspections WHERE id='{iid}';")
            return bool(ok and out and r in ('t','true')), (('filled; report read='+r) if ok and out else ('0 rows' if ok else 'ERR '+err[:80]))
        @case(f'F4_{who}',f'{who}: legacy snapshot without schema -> Fill/Review/Report templates fallback')
        def _():
            out=tsel(uid,f"SELECT count(*) FROM public.templates WHERE id='{T1}';")
            if who!='none':
                return out=='1', 'fallback rows='+out
            secs=tsel(uid,f"""SELECT jsonb_array_length(COALESCE(i.template_snapshot#>'{{schema,sections}}', t.schema#>'{{sections}}'))
              FROM public.inspections i JOIN public.templates t ON t.id=i.template_id
              WHERE i.id='{I_LEGACY}';""")
            return out=='1' and secs=='1', f'fallback rows={out} sections={secs}'
        @case(f'F5_{who}',f'{who}: JobDetail JHA picker')
        def _():
            out=tsel(uid,"SELECT count(*) FROM public.jha_templates WHERE archived=false;")
            return out=='1', 'rows='+out
        @case(f'F6_{who}',f'{who}: JhaFillPage /jha/new?templateId=')
        def _():
            out=tsel(uid,f"SELECT count(*) FROM public.jha_templates WHERE id='{JT1}';")
            return out=='1', 'rows='+out
        @case(f'F7_{who}',f'{who}: create JHA document for job (snapshot from F6, INSERT)')
        def _():
            ok,out,err=run(f"""WITH t AS (SELECT id,name,schema FROM public.jha_templates WHERE id='{JT1}')
              INSERT INTO public.jha_documents(template_id,template_snapshot,company_id,created_by,job_id)
              SELECT id, jsonb_build_object('name',name,'schema',schema), '{COA}', auth.uid(), '{JOB}' FROM t RETURNING id;""",uid)
            return bool(ok and out), ('created' if ok and out else ('no template row -> nothing to create' if ok else 'ERR '+err[:80]))
        @case(f'F8_{who}',f'{who}: dashboard TemplatesWidget / renderer list')
        def _():
            t=tsel(uid,"SELECT count(*) FROM public.templates WHERE archived=false;")
            r=tsel(uid,"SELECT count(*) FROM public.inspection_renderers;")
            return t=='2' and r=='2', f'templates={t} renderers={r}'
        @case(f'F9_{who}',f'{who}: INSERT template / INSERT custom renderer / UPDATE template')
        def _():
            ok,o,e=run(f"INSERT INTO public.templates(company_id,created_by,name) VALUES ('{COA}','{uid}','x') RETURNING 1;",uid)
            ok2,o2,e2=run(f"INSERT INTO public.inspection_renderers(company_id,key,label,built_in) VALUES ('{COA}','k_{who}','L',false) RETURNING 1;",uid)
            ok3,o3,e3=run(f"WITH u AS (UPDATE public.templates SET name='y' WHERE id='{T1}' RETURNING 1) SELECT count(*) FROM u;",uid)
            if who=='admin':
                return ok and ok2 and ok3 and o3=='1', f"template_insert={'ok' if ok else 'denied'} renderer_insert={'ok' if ok2 else 'denied'} template_update={o3 or e3[:40]}"
            if VARIANT=='base':
                return ok and (not ok2) and ok3 and o3=='1', f"base template_insert={'ok' if ok else 'denied'} renderer_insert={'ok' if ok2 else 'denied'} template_update={o3}"
            ins_denied = (not ok) and ('row-level security' in (e or '').lower())
            rend_denied = not ok2
            upd_denied = (ok3 and o3=='0') or ((not ok3) and 'row-level security' in (e3 or '').lower())
            return ins_denied and rend_denied and upd_denied, f"template_insert={'ok' if ok else e[:60]} renderer_insert={'ok' if ok2 else 'denied'} template_update={o3 if ok3 else e3[:40]}"
    mkf()
@case('A1p','admin with template_access=none still writes templates (admins count as edit)',('089','alt'))
def _():
    q(f"SET session_replication_role=replica; UPDATE public.profiles SET template_access='none' WHERE id='{AA}';")
    ok,out,err=run(f"INSERT INTO public.templates(company_id,created_by,name) VALUES ('{COA}','{AA}','admin-none') RETURNING 1;",AA)
    return bool(ok and out), out or err[:80]
@case('F10','edit MEMBER (non-admin): INSERT custom renderer refused (owner or admin)')
def _():
    q(f"SET session_replication_role=replica; UPDATE public.profiles SET template_access='edit' WHERE id='{MA}';")
    ok,out,err=run(f"INSERT INTO public.inspection_renderers(company_id,key,label,built_in) VALUES ('{COA}','k_edit','L',false) RETURNING 1;",MA)
    return (not ok) and 'row-level security' in (err or '').lower(), 'renderer insert='+('ALLOWED' if ok else err[:80])
@case('F12','founder with role=member writes renderers (same owner helper as the RPC)',('089','alt'))
def _():
    ok,out,err=run(f"INSERT INTO public.inspection_renderers(company_id,key,label,built_in) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc','k_founder','L',false) RETURNING 1;",OC)
    return bool(ok and out), 'founder renderer insert='+('ok' if ok and out else (err[:80] if err else out))
@case('A2p','founder with template_access=view still writes templates (founder counts as edit)',('089','alt'))
def _():
    q(f"SET session_replication_role=replica; UPDATE public.profiles SET template_access='view' WHERE id='{OC}';")
    ok,out,err=run(f"INSERT INTO public.templates(company_id,created_by,name) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc','{OC}','founder-view') RETURNING 1;",OC)
    return bool(ok and out), 'founder-view template insert='+('ok' if ok and out else (err[:80] if err else out))
@case('F11','company-B member reads 0 of company A on all 3 tables and cannot write them')
def _():
    n=tsel(MB,f"SELECT count(*) FROM public.templates WHERE id='{T1}';")
    n2=tsel(MB,f"SELECT count(*) FROM public.jha_templates WHERE id='{JT1}';")
    n3=tsel(MB,"SELECT count(*) FROM public.inspection_renderers WHERE company_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';")
    p,d=fail(run(f"INSERT INTO public.templates(company_id,created_by,name) VALUES ('{COA}','{MB}','x') RETURNING 1;",MB),'row-level security')
    return n=='0' and n2=='0' and n3=='0' and p, f't={n} j={n2} r={n3} write={d[:80]}'
def main():
    setup(); res=[]
    for cid,desc,vs,fn in CASES:
        if VARIANT not in vs or (ONLY and cid not in ONLY): continue
        seed()
        try: ok,detail=fn()
        except AssertionError as e: ok,detail=False,'ASSERT '+str(e)[:150]
        res.append({'id':cid,'desc':desc,'ok':bool(ok),'detail':str(detail)})
        print(('PASS' if ok else 'FAIL'),cid,'|',desc,'|',detail,flush=True)
    psql(f'DROP DATABASE IF EXISTS {DB}','postgres')
    if OUT: json.dump(res,open(OUT,'w'),indent=1)
    print('TOTAL',sum(r['ok'] for r in res),'/',len(res),flush=True)
main()
