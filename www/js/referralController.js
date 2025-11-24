import {
  getSupabaseClient,
  isSupabaseEnabledInConfig,
  isSupabaseReady,
} from './supabaseClient.js';
import authFacade, { saltAuth } from './authController.js';

function getAuthSnapshot() {
  if (saltAuth && typeof saltAuth.getState === 'function') {
    return saltAuth.getState();
  }
  if (authFacade && typeof authFacade.getState === 'function') {
    return authFacade.getState();
  }
  if (typeof window !== 'undefined' && window.SaltAuth?.getState) {
    try {
      return window.SaltAuth.getState();
    } catch (error) {
      console.warn('[referral] failed to read auth state from window', error);
    }
  }
  return null;
}

async function getSupabase() {
  if (!isSupabaseEnabledInConfig()) {
    return null;
  }
  const ready = await isSupabaseReady();
  if (!ready) {
    return null;
  }
  return getSupabaseClient();
}

function mapProfileRow(row, fallbackUserId) {
  if (!row) return null;
  return {
    id: row.id || null,
    authUserId: row.auth_user_id || fallbackUserId || null,
    username: row.username || null,
    referralCode: row.referral_code || null,
    referredBy: row.referred_by || null,
  };
}

function describeError(error) {
  if (!error) return null;
  return {
    code: error.code || null,
    message: error.message || null,
    details: error.details || null,
  };
}

async function refreshProfileSnapshotFromSupabase() {
  try {
    const authState = getAuthSnapshot();
    const supabase = await getSupabase();
    const playerId = authState?.profile?.id || null;
    const userId = authState?.user?.id || null;

    if (!supabase || !playerId) {
      return null;
    }

    const { data, error } = await supabase
      .from('players')
      .select('id, auth_user_id, username, referral_code, referred_by')
      .eq('id', playerId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('[referral] profile refresh failed', describeError(error));
      return null;
    }

    const mapped = mapProfileRow(data, userId);
    if (mapped && saltAuth && typeof saltAuth.notify === 'function') {
      try {
        saltAuth.notify({ profile: mapped });
      } catch (notifyError) {
        console.warn('[referral] failed to propagate refreshed profile', notifyError);
      }
    }

    return mapped;
  } catch (error) {
    console.warn('[referral] unexpected profile refresh failure', error);
    return null;
  }
}

async function applyReferralCode({ code } = {}) {
  try {
    const normalizedCode = typeof code === 'string'
      ? code.trim().toUpperCase()
      : '';

    if (!normalizedCode) {
      return { ok: false, reason: 'EMPTY_CODE' };
    }

    const authState = getAuthSnapshot();
    const me = authState?.profile || null;

    if (!authState?.user || !me?.id) {
      return { ok: false, reason: 'AUTH_REQUIRED' };
    }

    if (me.referredBy) {
      return { ok: false, reason: 'ALREADY_REFERRED' };
    }

    const supabase = await getSupabase();
    if (!supabase) {
      return { ok: false, reason: 'SUPABASE_ERROR', details: 'NOT_READY' };
    }

    const { data: referrer, error: referrerError } = await supabase
      .from('players')
      .select('id, referral_code')
      .eq('referral_code', normalizedCode)
      .limit(1)
      .maybeSingle();

    if (referrerError && referrerError.code !== 'PGRST116') {
      console.warn('[referral] failed to lookup referrer', describeError(referrerError));
      return { ok: false, reason: 'SUPABASE_ERROR', details: describeError(referrerError) };
    }

    if (!referrer) {
      return { ok: false, reason: 'CODE_NOT_FOUND' };
    }

    if (referrer.id === me.id) {
      return { ok: false, reason: 'SELF_REFERRAL_NOT_ALLOWED' };
    }

    const { data: existingReferralRow, error: referralCheckError } = await supabase
      .from('referrals')
      .select('id')
      .eq('referee_id', me.id)
      .limit(1)
      .maybeSingle();

    if (referralCheckError && referralCheckError.code !== 'PGRST116') {
      console.warn('[referral] referral pre-check failed', describeError(referralCheckError));
      return { ok: false, reason: 'SUPABASE_ERROR', details: describeError(referralCheckError) };
    }

    if (existingReferralRow) {
      return { ok: false, reason: 'ALREADY_REFERRED' };
    }

    const { error: insertError } = await supabase
      .from('referrals')
      .insert({ referrer_id: referrer.id, referee_id: me.id });

    if (insertError) {
      console.warn('[referral] insert into referrals failed', describeError(insertError));
      return { ok: false, reason: 'SUPABASE_ERROR', details: describeError(insertError) };
    }

    const { error: updateError } = await supabase
      .from('players')
      .update({ referred_by: normalizedCode })
      .eq('id', me.id);

    if (updateError) {
      console.warn('[referral] failed to update player referral code', describeError(updateError));
      return { ok: false, reason: 'SUPABASE_ERROR', details: describeError(updateError) };
    }

    await refreshProfileSnapshotFromSupabase();

    return {
      ok: true,
      payload: {
        referrerId: referrer.id,
        code: normalizedCode,
      },
    };
  } catch (error) {
    console.warn('[referral] unexpected applyReferralCode failure', error);
    return { ok: false, reason: 'SUPABASE_ERROR', details: { message: error?.message || String(error) } };
  }
}

async function getMyReferralInfo() {
  try {
    const authState = getAuthSnapshot();
    const me = authState?.profile || null;
    if (!authState?.user || !me?.id) {
      return { ok: false, reason: 'AUTH_REQUIRED' };
    }

    const refreshed = await refreshProfileSnapshotFromSupabase();
    const profile = refreshed || me;

    return {
      ok: true,
      payload: {
        playerId: profile?.id || me.id,
        code: profile?.referralCode || null,
        referredBy: profile?.referredBy || null,
      },
    };
  } catch (error) {
    console.warn('[referral] unexpected getMyReferralInfo failure', error);
    return { ok: false, reason: 'SUPABASE_ERROR', details: { message: error?.message || String(error) } };
  }
}

const ReferralController = {
  applyReferralCode,
  getMyReferralInfo,
  refreshProfileSnapshotFromSupabase,
};

if (typeof window !== 'undefined') {
  window.ReferralController = ReferralController;
  window.getReferralService = () => ReferralController;
}

export { applyReferralCode, getMyReferralInfo, refreshProfileSnapshotFromSupabase };
export default ReferralController;
