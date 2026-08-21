import { describe, expect, it } from 'vitest';
import {
  applyLivingJobToJha,
  applyLivingJobToTake5,
  livingCrewSlotId,
  livingHazardLines,
  livingJobSite,
  livingJhaMetaPatches,
  livingSwmsSummary,
  livingTake5HazardLines,
  livingTake5MetaPatches,
  livingTake5Summary,
  mergeLivingCrew,
} from './livingJha';
import type { JhaCrewMember } from '../types/jha';
import { jhaCardHint, jhaListContext } from './jhaNextAction';
import { take5CardHint, take5ListContext } from './take5NextAction';

const job = {
  id: 'job-1',
  title: 'Switchboard upgrade',
  address: '12 Site Rd, Geelong',
  assigned_team: ['sam', 'pat'],
};

const members = [
  { id: 'sam', name: 'Sam Tradie', email: 'sam@co.test', role: 'user' },
  { id: 'pat', name: 'Pat Lead', email: 'pat@co.test', role: 'admin' },
  { id: 'lee', name: 'Lee Extra', email: 'lee@co.test', role: 'user' },
];

const signedSam: JhaCrewMember = {
  id: 'crew-sam',
  name: 'Sam Tradie',
  role: 'Worker',
  date: '2026-08-20',
  profileId: 'sam',
  signature: 'data:image/png;base64,xx',
  signedAt: '2026-08-20T01:00:00.000Z',
};

const walkOn: JhaCrewMember = {
  id: 'walk-1',
  name: 'Casey Subbie',
  role: 'Worker',
  date: '2026-08-20',
};

describe('livingJobSite', () => {
  it('uses the job address, then the job title', () => {
    expect(livingJobSite(job)).toBe('12 Site Rd, Geelong');
    expect(livingJobSite({ ...job, address: '  ' })).toBe('Switchboard upgrade');
    expect(livingJobSite({ id: 'x', title: '', address: '' })).toBe('');
  });
});

describe('mergeLivingCrew', () => {
  it('adds assigned team who are not yet on the register', () => {
    const crew = mergeLivingCrew([], job.assigned_team, members, { today: '2026-08-21' });
    expect(crew.map(c => c.profileId)).toEqual(['sam', 'pat']);
    expect(crew[0]).toMatchObject({
      id: livingCrewSlotId('sam'),
      name: 'Sam Tradie',
      role: 'Worker',
      date: '2026-08-21',
    });
    expect(crew[1].role).toBe('Supervisor');
  });

  it('keeps signatures for people still on the job', () => {
    const crew = mergeLivingCrew([signedSam], ['sam', 'pat'], members);
    expect(crew.find(c => c.profileId === 'sam')?.signature).toBe(signedSam.signature);
    expect(crew.find(c => c.profileId === 'pat')?.name).toBe('Pat Lead');
  });

  it('drops unsigned people who left the job, keeps signed leavers and walk-ons', () => {
    const unsignedPat: JhaCrewMember = {
      id: 'crew-pat',
      name: 'Pat Lead',
      role: 'Supervisor',
      date: '2026-08-20',
      profileId: 'pat',
    };
    const crew = mergeLivingCrew(
      [signedSam, unsignedPat, walkOn],
      ['lee'],
      members,
    );
    expect(crew.map(c => c.name)).toEqual(['Sam Tradie', 'Casey Subbie', 'Lee Extra']);
    expect(crew.find(c => c.profileId === 'sam')?.signature).toBe(signedSam.signature);
    expect(crew.some(c => c.profileId === 'pat')).toBe(false);
  });
});

describe('applyLivingJobToJha', () => {
  it('is a no-op without a job', () => {
    const applied = applyLivingJobToJha({ siteName: 'Plant A' }, null, members);
    expect(applied.changed).toBe(false);
    expect(applied.siteName).toBe('Plant A');
  });

  it('writes the live job site and crew onto the document meta', () => {
    const applied = applyLivingJobToJha(
      { siteName: 'Old yard', crewSignOns: JSON.stringify([signedSam]) },
      job,
      members,
    );
    expect(applied.changed).toBe(true);
    expect(applied.siteName).toBe('12 Site Rd, Geelong');
    expect(applied.meta.siteName).toBe('12 Site Rd, Geelong');
    expect(applied.crew).toHaveLength(2);
    expect(applied.crew.find(c => c.profileId === 'sam')?.signature).toBe(signedSam.signature);
    expect(JSON.parse(applied.meta.crewSignOns)).toHaveLength(2);
  });

  it('does not mark changed when site and crew already match the job', () => {
    const first = applyLivingJobToJha({}, job, members, { today: '2026-08-21' });
    const second = applyLivingJobToJha(first.meta, job, members, { today: '2026-08-21' });
    expect(second.changed).toBe(false);
  });

  it('skips crew invent when members have not loaded', () => {
    const applied = applyLivingJobToJha({ siteName: '' }, job, [], { skipCrew: true });
    expect(applied.siteName).toBe('12 Site Rd, Geelong');
    expect(applied.crew).toEqual([]);
  });
});

describe('livingJhaMetaPatches / hazards', () => {
  it('patches only documents whose snapshot drifted from the job', () => {
    const current = applyLivingJobToJha({}, job, members, { today: '2026-08-21' });
    const patches = livingJhaMetaPatches(
      [
        { id: 'fresh', meta: current.meta },
        { id: 'stale', meta: { siteName: 'Old yard' } },
      ],
      job,
      members,
      { today: '2026-08-21' },
    );
    expect(patches.map(p => p.id)).toEqual(['stale']);
    expect(patches[0].meta.siteName).toBe('12 Site Rd, Geelong');
  });

  it('keeps hazards on the document steps — living sync does not invent or clear them', () => {
    const steps = [
      { hazards: 'Live parts', description: 'Isolate' },
      { hazards: '', description: 'Test dead' },
    ];
    expect(livingHazardLines(steps)).toEqual(['Live parts', 'Test dead']);
    const summary = livingSwmsSummary({
      meta: { siteName: 'Old' },
      steps,
      job,
      members,
    });
    expect(summary.site).toBe('12 Site Rd, Geelong');
    expect(summary.hazardLabel).toBe('Live parts; Test dead');
    expect(summary.crewLabel).toContain('Sam Tradie');
  });
});

describe('jhaListContext living overlay', () => {
  it('uses the live job site and living crew for the next action', () => {
    const living = applyLivingJobToJha({ siteName: '' }, job, members);
    const ctx = jhaListContext({
      status: 'draft',
      meta: living.meta,
      job_title: job.title,
      job_address: job.address,
      livingSite: living.siteName,
      livingCrew: living.crew,
    });
    expect(ctx.hasSite).toBe(true);
    expect(ctx.crewNamed).toBe(true);
    expect(ctx.crewSigned).toBe(false);
    expect(jhaCardHint(ctx)).toBe('Get signatures');
  });
});

describe('applyLivingJobToTake5', () => {
  it('is a no-op without a job', () => {
    const applied = applyLivingJobToTake5({ location: 'Plant A' }, null, members);
    expect(applied.changed).toBe(false);
    expect(applied.siteName).toBe('Plant A');
  });

  it('writes the live job site onto meta.location and merges assigned crew', () => {
    const applied = applyLivingJobToTake5(
      { location: 'Old yard', date: '2026-08-20', time: '07:00' },
      job,
      members,
    );
    expect(applied.changed).toBe(true);
    expect(applied.siteName).toBe('12 Site Rd, Geelong');
    expect(applied.meta.location).toBe('12 Site Rd, Geelong');
    expect(applied.meta.date).toBe('2026-08-20');
    expect(applied.meta.time).toBe('07:00');
    expect(applied.crew).toHaveLength(2);
    expect(applied.crew.map(c => c.profileId)).toEqual(['sam', 'pat']);
  });

  it('does not mark changed when location and crew already match the job', () => {
    const first = applyLivingJobToTake5({}, job, members, { today: '2026-08-21' });
    const second = applyLivingJobToTake5(first.meta, job, members, { today: '2026-08-21' });
    expect(second.changed).toBe(false);
  });

  it('keeps Take 5 checks on the document — living sync does not invent or clear them', () => {
    const checks = {
      identify_hazards: 'Live parts',
      stop_think: 'Isolate',
      control_actions: 'Lock out',
    };
    expect(livingTake5HazardLines(checks)).toEqual(['Live parts']);
    const summary = livingTake5Summary({
      meta: { location: 'Old' },
      ...checks,
      job,
      members,
    });
    expect(summary.site).toBe('12 Site Rd, Geelong');
    expect(summary.hazardLabel).toBe('Live parts');
    expect(summary.crewLabel).toContain('Sam Tradie');
  });

  it('patches only Take 5s whose snapshot drifted from the job', () => {
    const current = applyLivingJobToTake5({}, job, members, { today: '2026-08-21' });
    const patches = livingTake5MetaPatches(
      [
        { id: 'fresh', meta: current.meta },
        { id: 'stale', meta: { location: 'Old yard' } },
      ],
      job,
      members,
      { today: '2026-08-21' },
    );
    expect(patches.map(p => p.id)).toEqual(['stale']);
    expect(patches[0].meta.location).toBe('12 Site Rd, Geelong');
  });
});

describe('take5ListContext living overlay', () => {
  it('uses the live job site so a stale Take 5 location is still current', () => {
    const living = applyLivingJobToTake5({ location: '' }, job, members);
    const ctx = take5ListContext({
      status: 'draft',
      meta: { location: '' },
      stop_think: '',
      identify_hazards: '',
      control_actions: '',
      signature: null,
      livingSite: living.siteName,
      job_title: job.title,
      job_address: job.address,
    });
    expect(ctx.hasSite).toBe(true);
    expect(take5CardHint(ctx)).toBe('Continue');
  });
});
