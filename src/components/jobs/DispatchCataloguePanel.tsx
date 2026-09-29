import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isMissingRelation } from '../../lib/booking';
import { supabase } from '../../lib/supabase';

export function DispatchCataloguePanel({
  companyId,
  members,
}: {
  companyId: string;
  members: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const [skillName, setSkillName] = useState('');
  const [resourceName, setResourceName] = useState('');
  const [resourceCategory, setResourceCategory] = useState('tester');

  const { data: skills = [] } = useQuery({
    queryKey: ['dispatch-skills'],
    queryFn: async () => {
      const { data, error } = await supabase.from('dispatch_skills').select('id, name');
      if (error) {
        if (isMissingRelation(error)) return [];
        throw error;
      }
      return data ?? [];
    },
  });
  const { data: resources = [] } = useQuery({
    queryKey: ['dispatch-resources'],
    queryFn: async () => {
      const { data, error } = await supabase.from('dispatch_resources').select('id, name, category, status');
      if (error) {
        if (isMissingRelation(error)) return [];
        throw error;
      }
      return data ?? [];
    },
  });
  const { data: quals = [] } = useQuery({
    queryKey: ['dispatch-quals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dispatch_member_qualifications')
        .select('id, member_id, skill_id, expires_on');
      if (error) {
        if (isMissingRelation(error)) return [];
        throw error;
      }
      return data ?? [];
    },
  });

  const addSkill = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('dispatch_skills').insert({
        company_id: companyId,
        name: skillName.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSkillName('');
      queryClient.invalidateQueries({ queryKey: ['dispatch-skills'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-pack'] });
    },
  });

  const addResource = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('dispatch_resources').insert({
        company_id: companyId,
        name: resourceName.trim(),
        category: resourceCategory.trim() || 'tool',
        status: 'available',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setResourceName('');
      queryClient.invalidateQueries({ queryKey: ['dispatch-resources'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-pack'] });
    },
  });

  const grant = useMutation({
    mutationFn: async ({ memberId, skillId }: { memberId: string; skillId: string }) => {
      const { error } = await supabase.from('dispatch_member_qualifications').upsert({
        company_id: companyId,
        member_id: memberId,
        skill_id: skillId,
        issued_on: new Date().toISOString().slice(0, 10),
        expires_on: '2028-01-01',
      }, { onConflict: 'company_id,member_id,skill_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch-quals'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-pack'] });
    },
  });

  return (
    <div className="mt-6 bg-white rounded-xl border border-[#E5E7EB] p-5">
      <h2 className="text-sm font-medium text-[#1A1A1A]">Dispatch skills and equipment</h2>
      <p className="text-xs text-[#4A5568] mt-1">
        Company catalogue only. Profile licence numbers stay display data — they do not grant a ticket.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          className="form-input min-h-11 max-w-xs"
          placeholder="New ticket name"
          value={skillName}
          onChange={e => setSkillName(e.target.value)}
        />
        <button type="button" className="btn-secondary min-h-11" onClick={() => addSkill.mutate()} disabled={!skillName.trim()}>
          Add ticket
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          className="form-input min-h-11 max-w-xs"
          placeholder="Van, tester, EWP…"
          value={resourceName}
          onChange={e => setResourceName(e.target.value)}
        />
        <input
          className="form-input min-h-11 w-28"
          placeholder="category"
          value={resourceCategory}
          onChange={e => setResourceCategory(e.target.value)}
        />
        <button type="button" className="btn-secondary min-h-11" onClick={() => addResource.mutate()} disabled={!resourceName.trim()}>
          Add resource
        </button>
      </div>
      <ul className="mt-3 text-xs text-[#4A5568] space-y-1">
        {resources.map(r => (
          <li key={r.id}>{r.name} · {r.category} · {r.status}</li>
        ))}
      </ul>
      {skills.length > 0 && members.length > 0 && (
        <div className="mt-3 space-y-2">
          {members.map(member => (
            <div key={member.id} className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium w-36">{member.name}</span>
              {skills.map(skill => {
                const held = quals.some(q => q.member_id === member.id && q.skill_id === skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    className={`px-2 min-h-11 rounded-md text-xs ${held ? 'bg-navy text-white' : 'border border-[#E5E7EB]'}`}
                    onClick={() => grant.mutate({ memberId: member.id, skillId: skill.id })}
                  >
                    {skill.name}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
