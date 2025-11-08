import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabase } from '@/supabase';
import { useUserStore } from '@/stores/user';

export const useClubsStore = defineStore('clubs', () => {
  const userStore = useUserStore();

  const isLoading = ref(false);
  const error = ref(null);

  // Static cities for now; can be loaded from DB later
  const cities = ref([
    { id: 'almaty', name: 'Алматы', icon: '🏔️' },
    { id: 'nur-sultan', name: 'Нур-Султан', icon: '🏛️' },
    { id: 'shymkent', name: 'Шымкент', icon: '🌾' },
    { id: 'aktobe', name: 'Актобе', icon: '⚡' },
    { id: 'taraz', name: 'Тараз', icon: '🏺' },
    { id: 'pavlodar', name: 'Павлодар', icon: '🏭' }
  ]);

  // Map cityId -> clubs[]
  const cityIdToClubs = ref({});

  // Set of club ids the current user coordinates
  const coordinatorClubIds = ref(new Set());

  const getClubsByCity = computed(() => (cityId) => cityIdToClubs.value[cityId] || []);

  async function loadClubsForCity(cityId) {
    isLoading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await supabase
        .from('clubs')
        .select('id, name, city_id, logo_url, description, is_active')
        .eq('city_id', cityId)
        .order('name');
      if (err) throw err;
      cityIdToClubs.value = { ...cityIdToClubs.value, [cityId]: data || [] };
    } catch (e) {
      console.error('Failed to load clubs:', e);
      error.value = e.message || 'Failed to load clubs';
      // fallback to empty to avoid UI blocking
      cityIdToClubs.value = { ...cityIdToClubs.value, [cityId]: [] };
    } finally {
      isLoading.value = false;
    }
  }

  async function loadCoordinatorAccess() {
    coordinatorClubIds.value = new Set();
    try {
      if (!userStore.userData?.id) return;
      const { data, error: err } = await supabase
        .from('club_coordinators')
        .select('club_id')
        .eq('profile_id', userStore.userData.id);
      if (err) throw err;
      for (const row of data || []) coordinatorClubIds.value.add(row.club_id);
    } catch (e) {
      console.warn('Failed to load coordinator access:', e);
    }
  }

  function isCoordinatorForClub(clubId) {
    return coordinatorClubIds.value.has(clubId);
  }

  async function uploadClubLogo(clubId, file) {
    if (!file) throw new Error('No file provided');
    const bucket = supabase.storage.from('club-logos');
    const filePath = `${clubId}/${Date.now()}_${file.name}`;
    const { data, error: uploadError } = await bucket.upload(filePath, file, {
      cacheControl: '3600',
      upsert: true
    });
    if (uploadError) throw uploadError;

    const { data: publicUrl } = bucket.getPublicUrl(data.path);

    const { error: updateError } = await supabase
      .from('clubs')
      .update({ logo_url: publicUrl.publicUrl })
      .eq('id', clubId);
    if (updateError) throw updateError;

    // refresh club cache
    const existing = Object.entries(cityIdToClubs.value);
    for (const [cityId, clubs] of existing) {
      const idx = clubs.findIndex(c => c.id === clubId);
      if (idx !== -1) {
        const updated = { ...clubs[idx], logo_url: publicUrl.publicUrl };
        const next = clubs.slice();
        next.splice(idx, 1, updated);
        cityIdToClubs.value = { ...cityIdToClubs.value, [cityId]: next };
        break;
      }
    }

    return publicUrl.publicUrl;
  }

  async function updateClub(clubId, updates) {
    const { data, error: err } = await supabase
      .from('clubs')
      .update(updates)
      .eq('id', clubId)
      .select()
      .single();
    if (err) throw err;

    // update cache
    const entries = Object.entries(cityIdToClubs.value);
    for (const [cityId, clubs] of entries) {
      const idx = clubs.findIndex(c => c.id === clubId);
      if (idx !== -1) {
        const next = clubs.slice();
        next.splice(idx, 1, data);
        cityIdToClubs.value = { ...cityIdToClubs.value, [cityId]: next };
        break;
      }
    }
    return data;
  }

  async function createClub({ name, city_id, description }) {
    const { data, error: err } = await supabase
      .from('clubs')
      .insert({ name, city_id, description })
      .select()
      .single();
    if (err) throw err;
    const list = cityIdToClubs.value[city_id] || [];
    cityIdToClubs.value = { ...cityIdToClubs.value, [city_id]: [...list, data] };
    return data;
  }

  return {
    // state
    isLoading,
    error,
    cities,
    getClubsByCity,
    // perms
    loadCoordinatorAccess,
    isCoordinatorForClub,
    // actions
    loadClubsForCity,
    uploadClubLogo,
    updateClub,
    createClub
  };
});






