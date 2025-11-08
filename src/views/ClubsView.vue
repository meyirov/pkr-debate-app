<template>
  <div class="clubs-container">
    <!-- City Selection -->
    <div v-if="currentView === 'cities'" class="cities-view">
      <div class="header">
        <h2 class="title">{{ t('clubs') }}</h2>
        <p class="subtitle">Выберите город, чтобы увидеть клубы</p>
      </div>

      <div class="cities-grid">
        <div
          v-for="city in clubsStore.cities"
          :key="city.id"
          @click="selectCity(city)"
          class="city-card"
        >
          <div class="city-icon">{{ city.icon }}</div>
          <h3 class="city-name">{{ city.name }}</h3>
        </div>
      </div>
    </div>

    <!-- Club List -->
    <div v-else class="clubs-view">
      <div class="header">
        <button @click="goBack" class="back-button">← {{ t('back') }}</button>
        <h2 class="title">{{ t('clubs') }} — {{ selectedCity?.name }}</h2>
      </div>

      <div v-if="clubsStore.isLoading" class="loading">{{ t('loading') }}</div>
      <div v-else class="clubs-grid">
        <div
          v-for="club in clubs"
          :key="club.id"
          class="club-card"
        >
          <div class="logo-wrapper">
            <img
              class="club-logo"
              :src="club.logo_url || placeholderLogo"
              :alt="club.name"
            />
          </div>
          <div class="club-content">
            <h3 class="club-name">{{ club.name }}</h3>
            <p v-if="club.description" class="club-desc">{{ club.description }}</p>

            <div v-if="isCoordinator(club.id)" class="admin-actions">
              <input
                :id="`logo-input-${club.id}`"
                ref="fileInputs"
                class="file-input"
                type="file"
                accept="image/*"
                @change="onLogoSelected(club, $event)"
              />
              <button class="btn" @click="triggerLogoUpload(club)">Загрузить логотип</button>
              <button class="btn secondary" @click="startEdit(club)">Редактировать</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Inline editor -->
      <div v-if="editingClub" class="editor">
        <div class="editor-card">
          <h4>Редактирование: {{ editingClub.name }}</h4>
          <label>
            Название
            <input v-model="editForm.name" type="text" />
          </label>
          <label>
            Описание
            <textarea v-model="editForm.description" rows="3" />
          </label>
          <div class="editor-actions">
            <button class="btn" @click="saveEdit">{{ t('save') }}</button>
            <button class="btn secondary" @click="cancelEdit">{{ t('cancel') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useClubsStore } from '@/stores/clubs';

const { t } = useI18n();
const clubsStore = useClubsStore();

const currentView = ref('cities');
const selectedCity = ref(null);
const editingClub = ref(null);
const editForm = ref({ name: '', description: '' });
const fileInputs = ref(null);

const clubs = computed(() => selectedCity.value ? clubsStore.getClubsByCity(selectedCity.value.id) : []);

const placeholderLogo =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgdmlld0JveD0iMCAwIDMyMCAxODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHJlY3Qgd2lkdGg9IjMyMCIgaGVpZ2h0PSIxODAiIGZpbGw9IiMxZTFkMWUiIHJ4PSIxMiIvPgogIDxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjI4OCIgaGVpZ2h0PSIxNDgiIGZpbGw9IiMyMjIyMjIiIHJ4PSI4Ii8+CiAgPHBhdGggZD0iTTgwIDEyMGMwLTIyIDI2LTM2IDgwLTM2czgwIDE0IDgwIDM2IiBzdHJva2U9IiM3YzNhZWQiIHN0cm9rZS13aWR0aD0iNCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWRhc2hhcnJheT0iNCIvPgogIDxyZWN0IHg9IjQ4IiB5PSI0OCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iNiIgZmlsbD0iIzNjM2MzYyIvPgogIDxyZWN0IHg9IjEzMiIgeT0iNDgiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcng9IjYiIGZpbGw9IiMzYzNjM2MiLz4KICA8cmVjdCB4PSIyMTYiIHk9IjQ4IiB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHJ4PSI2IiBmaWxsPSIjM2MzYzNjIi8+CiAgPHRleHQgeD0iMTYiIHk9IjE3MiIgZmlsbD0iI2JiYiIgZm9udC1zaXplPSIxMHB4IiBmb250LXdlaWdodD0iNjAwIj5Mb2dvIG5vdCBhdmFpbGFibGU8L3RleHQ+Cjwvc3ZnPg==';

function selectCity(city) {
  selectedCity.value = city;
  currentView.value = 'clubs';
  clubsStore.loadClubsForCity(city.id);
}

function goBack() {
  currentView.value = 'cities';
  selectedCity.value = null;
}

function isCoordinator(clubId) {
  return clubsStore.isCoordinatorForClub(clubId);
}

function triggerLogoUpload(club) {
  const input = document.getElementById(`logo-input-${club.id}`);
  input?.click();
}

async function onLogoSelected(club, event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await clubsStore.uploadClubLogo(club.id, file);
  } catch (e) {
    alert('Не удалось загрузить логотип: ' + (e.message || e));
  } finally {
    event.target.value = '';
  }
}

function startEdit(club) {
  editingClub.value = club;
  editForm.value = { name: club.name || '', description: club.description || '' };
}

function cancelEdit() {
  editingClub.value = null;
}

async function saveEdit() {
  if (!editingClub.value) return;
  try {
    await clubsStore.updateClub(editingClub.value.id, {
      name: editForm.value.name.trim(),
      description: editForm.value.description?.trim() || null
    });
    editingClub.value = null;
  } catch (e) {
    alert('Не удалось сохранить: ' + (e.message || e));
  }
}

onMounted(async () => {
  await clubsStore.loadCoordinatorAccess();
});
</script>

<style scoped>
.clubs-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  padding-bottom: 100px;
  /* Apple-like deep canvas with subtle radial highlights for eSports energy */
  background:
    radial-gradient(1200px 600px at 0% -20%, rgba(124, 58, 237, 0.12), transparent 55%),
    radial-gradient(1000px 500px at 100% 120%, rgba(16, 185, 129, 0.10), transparent 55%),
    linear-gradient(135deg, #0b0c10 0%, #0e1116 100%);
  min-height: 100vh;
}

.header { text-align: center; margin-bottom: 24px; position: relative; }
.title {
  font-size: 2.2rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  /* Sleek dual-tone gradient text */
  background: linear-gradient(135deg, #b9b9c2 0%, #ffffff 35%, #a78bfa 90%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.subtitle { color: #9aa3b2; font-weight: 500; }

.cities-grid {
  display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.city-card {
  position: relative;
  text-align: center;
  cursor: pointer;
  border-radius: 16px;
  padding: 20px;
  background: rgba(22, 22, 28, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease, background .25s ease;
  overflow: hidden;
  /* Gradient ring */
}
.city-card::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 18px;
  padding: 1px;
  background: linear-gradient(135deg, rgba(124,58,237,.45), rgba(99,102,241,.35), rgba(16,185,129,.35));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  pointer-events: none;
}
.city-card:hover {
  transform: translateY(-6px);
  box-shadow:
    0 10px 24px rgba(124, 58, 237, 0.18),
    0 2px 0 rgba(255,255,255,0.03) inset;
  background: rgba(26, 26, 32, 0.7);
}
.city-icon { font-size: 2rem; margin-bottom: 8px; }
.city-name { color: #f3f4f6; font-weight: 800; letter-spacing: .2px; }

.loading { color: #aaa; text-align: center; padding: 20px; }

.clubs-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  max-width: 100%;
}
.club-card {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  background: rgba(18, 19, 23, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: transform 0.28s ease, box-shadow 0.28s ease, border-color 0.28s ease, background 0.28s ease;
  /* Top accent beam */
}
.club-card::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, rgba(124,58,237,.0), rgba(124,58,237,.65), rgba(16,185,129,.65), rgba(124,58,237,.0));
  opacity: .75;
}
.club-card::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 20px;
  padding: 1px;
  background: linear-gradient(135deg, rgba(124,58,237,.45), rgba(99,102,241,.35), rgba(16,185,129,.35));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  pointer-events: none;
}
.club-card:hover {
  transform: translateY(-8px);
  box-shadow:
    0 24px 60px rgba(124, 58, 237, 0.25),
    0 8px 20px rgba(0, 0, 0, 0.55);
  background: rgba(22, 23, 28, 0.7);
  border-color: rgba(167, 139, 250, 0.35);
}
.logo-wrapper {
  aspect-ratio: 1/1;
  width: 100%;
  background:
    radial-gradient(180px 100px at 50% 30%, rgba(124,58,237,.12), transparent 60%),
    linear-gradient(180deg, #0b0c10 0%, #0f1117 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.club-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  padding: 24px;
  filter: drop-shadow(0 6px 14px rgba(0,0,0,.35));
}
.club-content { padding: 16px; }
.club-name {
  color: #f9fafb;
  font-weight: 900;
  margin: 0 0 8px;
  font-size: 1.15rem;
  letter-spacing: -0.01em;
}
.club-desc {
  color: #9aa3b2;
  font-size: 0.9rem;
  margin: 0 0 12px;
  min-height: 2.5em;
}

.admin-actions { display: flex; gap: 8px; margin-top: 10px; }
.file-input { display: none; }
.btn {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  color: #fff; border: none; border-radius: 12px; padding: 10px 14px; cursor: pointer; font-weight: 800;
  box-shadow: 0 6px 18px rgba(124,58,237,.35);
  transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
}
.btn.secondary {
  background: rgba(44,44,52,.8);
  color: #e5e7eb; border: 1px solid #3a3a44; border-radius: 12px;
}
.btn:hover { filter: brightness(1.04); transform: translateY(-1px); box-shadow: 0 10px 22px rgba(124,58,237,.4); }

.back-button {
  background: rgba(44,44,52,.8);
  color: #fff; border: 1px solid #3a3a44; border-radius: 12px; padding: 10px 12px; cursor: pointer;
  transition: transform .18s ease, background .18s ease, border-color .18s ease;
}
.back-button:hover { transform: translateY(-1px); border-color: rgba(167,139,250,.6); }

.editor { position: fixed; bottom: 80px; left: 0; right: 0; display: flex; justify-content: center; }
.editor-card {
  background: rgba(30, 30, 36, .85);
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 16px; padding: 16px; width: min(520px, 92vw);
  backdrop-filter: saturate(140%) blur(12px);
}
.editor-card h4 { color: #fff; margin: 0 0 12px; }
.editor-card label { display: block; color: #ccc; font-size: .9rem; margin: 8px 0; }
.editor-card input, .editor-card textarea { width: 100%; background: #131317; color: #fff; border: 1px solid #2a2a33; border-radius: 12px; padding: 12px; }
.editor-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }

@supports (backdrop-filter: blur(8px)) {
  .city-card,
  .club-card {
    backdrop-filter: saturate(140%) blur(8px);
  }
}

@media (max-width: 768px) {
  .clubs-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
  }
}

@media (max-width: 480px) {
  .title { font-size: 1.6rem; }
  .clubs-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
  .club-content { padding: 12px; }
  .club-name { font-size: 0.95rem; }
  .logo-wrapper { padding: 12px; }
}
</style>


