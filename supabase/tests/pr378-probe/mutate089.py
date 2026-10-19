#!/usr/bin/env python3
"""SQL mutants of migration 089 (the version of update_member_settings that ends up live). For each mutant:
 (a) PR proof supabase/tests/update_member_settings.sql run against a copy of supabase/ with the mutated 089
 (b) our suite2.py (prod-faithful schema) VARIANT=089 with the mutated 089.  Usage: mutate089.py PGVER [IDS]"""
import subprocess, sys, os, shutil, json, re
P=os.path.dirname(os.path.abspath(__file__)); REPO=os.environ.get('REPO','/workspace'); PGV=sys.argv[1]
SRC=open(f'{REPO}/supabase/migrations/20261019020000_089_profile_self_escalation_and_template_rls.sql').read()
RPC_START=SRC.index('CREATE OR REPLACE FUNCTION public.update_member_settings(')
def rpc_sub(old,new):
    def f(s):
        head,body=s[:RPC_START],s[RPC_START:]; assert old in body,(old[:60]); return head+body.replace(old,new,1)
    return f
def sub(old,new,count=1):
    def f(s): assert old in s,(old[:60]); return s.replace(old,new,count)
    return f
def pol(name,old,new):
    def f(s):
        i=s.index(f'CREATE POLICY "{name}"'); j=s.index(';',i); blk=s[i:j]; assert old in blk,(name,old); return s[:i]+blk.replace(old,new)+s[j:]
    return f
M={
 'G1':('trigger: drop auth.uid() = OLD.id (raise for any writer)', sub("  IF auth.uid() = OLD.id\n     AND (","  IF true\n     AND (")),
 'G2':('trigger: key on current_user instead of auth.uid()', sub("  IF auth.uid() = OLD.id\n","  IF current_user = 'authenticated'\n")),
 'G3':('trigger: honour flag outside RPC (GUC only, no gate)', sub("  IF current_setting('app.member_admin', true) = 'on'\n     AND EXISTS (","  IF current_setting('app.member_admin', true) = 'on'\n     OR NOT EXISTS (")),
 'G3b':('trigger: honour flag outside RPC (drop gate EXISTS entirely)', sub("""     AND EXISTS (
       SELECT 1
       FROM public.update_member_settings_gate g
       WHERE g.txid = txid_current()
     ) THEN""","     THEN")),
 'G4':('RPC: never deletes its gate row (bypass lingers for rest of txn)', rpc_sub("  DELETE FROM public.update_member_settings_gate WHERE txid = txid_current();\n","")),
 'G5':('gate table: no RLS + no REVOKE (authenticated can forge its txid)', lambda s: sub("ALTER TABLE public.update_member_settings_gate ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON TABLE public.update_member_settings_gate FROM PUBLIC, anon, authenticated;\n","GRANT ALL ON TABLE public.update_member_settings_gate TO authenticated;\n")(s)),
 'G6':('trigger WHEN: drop template_access from column list', sub("    OR NEW.template_access IS DISTINCT FROM OLD.template_access\n    OR NEW.expense_cost_model_id IS DISTINCT FROM OLD.expense_cost_model_id\n    OR NEW.company_id IS DISTINCT FROM OLD.company_id\n  )\n  EXECUTE","    OR NEW.expense_cost_model_id IS DISTINCT FROM OLD.expense_cost_model_id\n    OR NEW.company_id IS DISTINCT FROM OLD.company_id\n  )\n  EXECUTE")),
 'S2':('089 RPC: remove same-company actor/target check', rpc_sub("     OR v_actor_company IS DISTINCT FROM v_target_company THEN","     OR false THEN")),
 'S2b':('089 RPC: remove same-company check AND UPDATE company filter', lambda s: rpc_sub("    AND p.company_id = v_actor_company;\n","    ;\n")(rpc_sub("     OR v_actor_company IS DISTINCT FROM v_target_company THEN","     OR false THEN")(s))),
 'S8':('089 RPC: drop cost-model same-company check', rpc_sub("          AND m.company_id = v_actor_company\n","")),
 'S1':('089 RPC: drop 0-row RAISE', rpc_sub("  IF v_updated = 0 THEN\n    RAISE EXCEPTION 'No member settings were updated';\n  END IF;\n","")),
 'S4':('089 RPC: allow self role change', rpc_sub("    IF v_actor_id IS NOT DISTINCT FROM member_id THEN\n      RAISE EXCEPTION 'You cannot change your own role' USING ERRCODE = '42501';\n    END IF;\n","")),
 'S3':('089 RPC: drop owner-only role check', rpc_sub("    IF v_actor_id IS DISTINCT FROM v_owner_id THEN\n      RAISE EXCEPTION 'Only the company owner can change roles' USING ERRCODE = '42501';\n    END IF;\n","")),
 'S6':('089 RPC: drop admin/owner check', rpc_sub("  IF v_actor_role IS DISTINCT FROM 'admin'\n     AND v_actor_id IS DISTINCT FROM v_owner_id THEN","  IF false THEN")),
 'S10':('089 RPC: drop role value validation', rpc_sub("    IF v_new_role IS NULL OR v_new_role NOT IN ('admin', 'member') THEN","    IF false THEN")),
 'S9':('089 RPC: drop REVOKE (PUBLIC/anon keep EXECUTE)', sub("REVOKE ALL ON FUNCTION public.update_member_settings(uuid, jsonb) FROM PUBLIC, anon;\n","")),
 'A1':('caller_template_access: admin no longer counts as edit', sub("    WHEN p.role = 'admin' THEN 'edit'\n","")),
}
COMPANY = 'company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())'
EDIT = 'AND (SELECT public.caller_can_edit_templates())'
EDIT_FN = '(SELECT public.caller_can_edit_templates())'
for t,pre in [('templates','templates'),('jha_templates','jha_templates')]:
    M[f'P_{t}_sel']=(f'{t} SELECT: drop company filter', pol(f'{pre}_select_company_members', COMPANY, 'true'))
    M[f'P_{t}_ins']=(f'{t} INSERT: drop edit gate', pol(f'{pre}_insert_by_template_access', EDIT, ''))
    M[f'P_{t}_updchk']=(f'{t} UPDATE: edit->true', pol(f'{pre}_update_by_template_access', EDIT_FN, 'true'))
    M[f'P_{t}_del']=(f'{t} DELETE: drop edit gate', pol(f'{pre}_delete_by_template_access', EDIT, ''))
M['P_inspection_renderers_sel']=('inspection_renderers SELECT: drop company filter', pol('inspection_renderers_select_company_members', COMPANY, 'true'))
M['P_inspection_renderers_ins']=('inspection_renderers INSERT: drop admin role', pol('Company admins can insert renderers', "AND role = 'admin'", ''))
M['P_inspection_renderers_updchk']=('inspection_renderers UPDATE: drop admin role', pol('Company admins can update renderers', "AND role = 'admin'", ''))
M['P_inspection_renderers_del']=('inspection_renderers DELETE: drop admin role', pol('Company admins can delete renderers', "AND role = 'admin'", ''))
ids=sys.argv[2].split(',') if len(sys.argv)>2 else list(M)
res={}
for mid in ids:
    desc,fn=M[mid]; mutated=fn(SRC); assert mutated!=SRC, mid
    d=f'/tmp/mut089/{mid}'; shutil.rmtree(d,ignore_errors=True); shutil.copytree(f'{REPO}/supabase/migrations',f'{d}/supabase/migrations'); shutil.copytree(f'{REPO}/supabase/tests',f'{d}/supabase/tests')
    mp=f'{d}/supabase/migrations/20261019020000_089_profile_self_escalation_and_template_rls.sql'; open(mp,'w').write(mutated)
    PS=[f'/usr/lib/postgresql/{PGV}/bin/psql','-h',f'/tmp/pg378r2-{PGV}','-p',f'554{PGV}','-U','postgres','-X','-q']
    db=f'mut_{mid.lower()}'
    subprocess.run(PS+['-d','postgres','-c',f'DROP DATABASE IF EXISTS {db}','-c',f'CREATE DATABASE {db}'],capture_output=True)
    pr=subprocess.run(PS+['-d',db,'-v','ON_ERROR_STOP=1','-f',f'{d}/supabase/tests/update_member_settings.sql'],capture_output=True,text=True)
    prf=[l.split('|')[0].strip() for l in pr.stdout.splitlines() if re.match(r'^\s*\S+\s*\|\s*f\s*\|',l)]
    pr_killed = pr.returncode!=0
    pr_why = ','.join(prf) if prf else (pr.stderr.strip().splitlines()[-1][:120] if pr.returncode else '')
    subprocess.run(PS+['-d','postgres','-c',f'DROP DATABASE IF EXISTS {db}'],capture_output=True)
    st=subprocess.run(['python3',f'{P}/suite2.py',PGV,'089',mp,'-'],capture_output=True,text=True)
    sf=[l.split('|')[0].replace('FAIL','').strip() for l in st.stdout.splitlines() if l.startswith('FAIL')]
    if st.returncode!=0 and not sf: sf=['setup error: '+st.stderr.strip()[-120:]]
    res[mid]={'desc':desc,'pr_killed':pr_killed,'pr_by':pr_why,'suite_killed':bool(sf),'suite_by':','.join(sf)}
    print(f"{mid:22} PR={'KILLED' if pr_killed else 'SURVIVED':8} [{pr_why[:70]}]  OURS={'KILLED' if sf else 'SURVIVED':8} [{','.join(sf)[:80]}]  {desc}",flush=True)
json.dump(res,open(os.environ.get('MUT089_JSON', f'/tmp/mut089-pg{PGV}.json'),'w'),indent=1)
