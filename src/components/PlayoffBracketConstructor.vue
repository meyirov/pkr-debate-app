<template>
  <div class="bracket-constructor" :class="{ fullscreen: isFullscreen }" ref="rootEl">
    <!-- Top toolbar -->
    <div class="top-toolbar" ref="topToolbar">
      <div class="toolbar-left">
        <h3>Playoff Constructor</h3>
        <div class="format-selector">
          <label>Format:</label>
          <select v-model="bracketFormat">
            <option value="АПФ">АПФ (2 teams)</option>
            <option value="БПФ">БПФ (4 teams)</option>
          </select>
        </div>
        <div class="format-selector">
          <label>ЛД:</label>
          <input type="checkbox" v-model="ldEnabled" />
        </div>
      </div>
      <div class="toolbar-right">
        <div class="round-league-controls">
          <div class="control">
            <label>Stage name:</label>
            <input class="stage-input" v-model="stageName" placeholder="e.g. 1/8"/>
          </div>
          <button class="tool-btn" @click="lockCurrentStage" :disabled="!stageName">Lock Stage</button>
        </div>
        <div v-if="ldEnabled" class="canvas-tabs">
          <button :class="['tab-btn', { active: activeCanvas === 'alpha' }]" @click="activeCanvas = 'alpha'">Альфа</button>
          <button :class="['tab-btn', { active: activeCanvas === 'ld' }]" @click="activeCanvas = 'ld'">ЛД</button>
        </div>
        <div class="zoom-controls">
          <button @click="zoomOut" class="zoom-btn">-</button>
          <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
          <button @click="zoomIn" class="zoom-btn">+</button>
          <button @click="resetZoom" class="zoom-btn">Reset</button>
        </div>
        <button @click="toggleFullscreen" class="tool-btn">{{ isFullscreen ? 'Exit Full Screen' : 'Full Screen' }}</button>
        <div class="add-nodes-group">
          <input type="number" min="1" v-model.number="addCount" class="count-input" />
          <button @click="addMatchNodes(addCount)" class="tool-btn primary">+ Add Match Node(s)</button>
        </div>
        <button @click="clearBracket" class="tool-btn danger">Clear All</button>
        <button @click="saveBracket" class="tool-btn success">Save Bracket</button>
      </div>
    </div>
    
    <!-- Full canvas area -->
    <div class="canvas-container" ref="canvasContainer" :style="{ height: containerHeight + 'px' }"
         @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
      <div class="canvas-content" ref="contentLayer" :style="contentTransformStyle">
        <canvas 
          ref="bracketCanvas"
          @click="handleCanvasClick"
          @touchstart="handleCanvasTouchStart"
          @touchmove="handleCanvasTouchMove"
          @touchend="handleCanvasTouchEnd"
          @wheel="handleCanvasWheel"
        ></canvas>
        
        <!-- Connection lines (inside content so they scale/pan together) -->
        <svg class="connection-lines" ref="connectionSvg">
          <!-- Round columns overlay -->
          
          <path
            v-for="connection in currentConnections"
            :key="connection.id"
            :d="connection.d"
            fill="none"
            stroke="#8b5cf6"
            stroke-width="2"
            marker-end="url(#arrowhead)"
          />
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                    refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#8b5cf6" />
            </marker>
          </defs>
        </svg>

        <!-- Match nodes -->
        <div 
          v-for="match in currentMatchNodes" 
          :key="match.id"
          class="match-node"
          :style="{ left: match.x + 'px', top: match.y + 'px' }"
          :ref="el => setMatchNodeRef(match.id, el)"
          @click.stop="handleNodeClick(match)"
        >
          <div class="match-header">
            <div class="node-drag-handle" title="Drag" @pointerdown.stop="startNodeDrag($event, match)">
              <span class="grip"></span>
            </div>
          <span class="match-title">Match {{ match.id }}</span>
          <button @click="deleteMatch(match.id)" class="delete-btn">×</button>
        </div>
        <div class="meta-row">
          <span v-if="match.stageLabel" class="stage-badge">{{ match.stageLabel }}</span>
        </div>
        <div class="match-places">
          <div 
            v-for="(place, index) in match.places" 
            :key="index"
            class="place-slot"
          >
            <label>{{ activeCanvas === 'ld' ? 'Speaker place:' : 'Team place:' }}</label>
            <select v-model="match.places[index]" @change="activeCanvas === 'ld' ? updateMatchSpeakers(match) : updateMatchTeams(match)">
              <option value="">Select place</option>
              <option v-for="n in optionCount" :key="n" :value="n">{{ n }}</option>
            </select>
            <div v-if="match.places[index]" class="assigned-team">
              {{ activeCanvas === 'ld' ? speakerLabelByPlace(match.places[index]) : (getTeamByPlace(match.places[index])?.faction_name || 'Team not found') }}
            </div>
          </div>
        </div>
        <div class="match-actions">
          <button @click="connectToNext(match)" class="connect-btn">Connect</button>
        </div>
        </div>
      </div>
    </div>
    
    <!-- Connection mode indicator -->
    <div v-if="connectionMode" class="connection-mode">
      Click on a match to connect it to the selected match
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue';

const props = defineProps({
  availableTeams: {
    type: Array,
    default: () => []
  },
  initialBracket: {
    type: Object,
    default: null
  },
  availableSpeakers: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['save']);

// Canvas and DOM refs
const bracketCanvas = ref(null);
const canvasContainer = ref(null);
const connectionSvg = ref(null);
const contentLayer = ref(null);
const rootEl = ref(null);
const topToolbar = ref(null);

// Bracket state
const bracketFormat = ref('АПФ');
// Alpha canvas (main)
const matchNodes = ref([]);
const connections = ref([]);
// LD canvas
const ldMatchNodes = ref([]);
const ldConnections = ref([]);

const availableTeams = ref(Array.isArray(props.availableTeams) ? [...props.availableTeams] : []);
const availableSpeakers = ref(Array.isArray(props.availableSpeakers) ? [...props.availableSpeakers] : []);
watch(() => props.availableTeams, (val) => {
  availableTeams.value = Array.isArray(val) ? [...val] : [];
}, { immediate: true });
watch(() => props.availableSpeakers, (val) => {
  availableSpeakers.value = Array.isArray(val) ? [...val] : [];
}, { immediate: true });

const ldEnabled = ref(false);
const activeCanvas = ref('alpha');
const addCount = ref(1);

// Full screen state
const isFullscreen = ref(false);
const onFsChange = () => {
  isFullscreen.value = !!document.fullscreenElement ||
    (rootEl.value && rootEl.value.classList.contains('fullscreen'));
};
const enterFullscreen = async () => {
  const el = rootEl.value;
  if (!el) return;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else {
      // Fallback overlay mode
      isFullscreen.value = true;
    }
  } catch (_) {
    isFullscreen.value = true;
  }
};
const exitFullscreen = async () => {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  } finally {
    isFullscreen.value = false;
  }
};
const toggleFullscreen = () => {
  if (isFullscreen.value || document.fullscreenElement) exitFullscreen(); else enterFullscreen();
};

// Which set is visible
const currentMatchNodes = computed(() => activeCanvas.value === 'alpha' ? matchNodes.value : ldMatchNodes.value);
const currentConnections = computed(() => activeCanvas.value === 'alpha' ? connections.value : ldConnections.value);

// Interaction state
const isDragging = ref(false);
const dragTarget = ref(null);
const connectionMode = ref(false);
const connectionSource = ref(null);
const nodeRefs = new Map();

// Zoom/Pan state
const zoom = ref(1);
const minZoom = 0.25;
const maxZoom = 3;
const panX = ref(0);
const panY = ref(0);
const isPanning = ref(false);
const lastPointerX = ref(0);
const lastPointerY = ref(0);

// Dynamic container sizing to maximize canvas area
const containerHeight = ref(600);
const updateContainerHeight = () => {
  const toolbarH = topToolbar.value?.offsetHeight || 0;
  const vh = window.innerHeight || 800;
  const bottomNav = document.querySelector('.navbar');
  const bottomNavH = bottomNav?.offsetHeight || 0;
  const safeInset = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-bottom)')) || 0;
  containerHeight.value = Math.max(360, vh - toolbarH - bottomNavH - safeInset);
};

// Very large virtual workspace so you can pan/zoom freely
const workspaceWidth = ref(5000);
const workspaceHeight = ref(3000);

// Round/League organization
const rounds = [
  { key: 'r16', label: '1/16' },
  { key: 'r8', label: '1/8' },
  { key: 'r4', label: '1/4' },
  { key: 'r2', label: '1/2' },
  { key: 'final', label: 'Final' }
];
const activeRoundKey = ref('r16');
const viewLeague = ref('both'); // both | alpha | beta
const newNodeLeague = ref('alpha');

const contentTransformStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
  transformOrigin: 'top left',
  width: `${workspaceWidth.value}px`,
  height: `${workspaceHeight.value}px`,
  position: 'relative'
}));

const optionCount = computed(() => activeCanvas.value === 'ld' ? (availableSpeakers.value?.length || 0) : (availableTeams.value?.length || 0));
const speakerLabelByPlace = (place) => {
  const s = getSpeakerByPlace(place);
  return s?.fullname || s?.username || 'Speaker not found';
};

// Canvas setup
onMounted(() => {
  setupCanvas();
  if (props.initialBracket) {
    loadBracket(props.initialBracket);
  }
  document.addEventListener('fullscreenchange', onFsChange);
  const onKey = (e) => { if (e.key === 'Escape' && isFullscreen.value) exitFullscreen(); };
  document.addEventListener('keydown', onKey);
  // store to remove on unmount
  rootEl.value && (rootEl.value._onKey = onKey);
  updateContainerHeight();
  window.addEventListener('resize', updateContainerHeight);
});

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFsChange);
  const onKey = rootEl.value && rootEl.value._onKey; if (onKey) document.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', updateContainerHeight);
});

const setupCanvas = () => {
  const canvas = bracketCanvas.value;
  const container = canvasContainer.value;
  
  if (!canvas || !container) return;
  
  const resizeCanvas = () => {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  };
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  // Cleanup
  return () => window.removeEventListener('resize', resizeCanvas);
};

// Team dragging
const startDrag = (event, team) => {
  isDragging.value = true;
  dragTarget.value = team;
  event.dataTransfer.setData('text/plain', team.id);
};

// Match node dragging
const gridSize = 10;

// Placement helpers for column-based stages
const defaultNodeW = 260;
const defaultNodeH = 160;
const columnGap = 140;
const rowGap = 40;

const getStageBounds = (label) => {
  const nodes = currentMatchNodes.value.filter(n => n.stageLabel === label);
  if (nodes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    const el = nodeRefs.get(n.id);
    const w = el?.offsetWidth || defaultNodeW;
    const h = el?.offsetHeight || defaultNodeH;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + w);
    maxY = Math.max(maxY, n.y + h);
  });
  return { minX, minY, maxX, maxY };
};

const getLastLockedRightEdge = () => {
  const labels = new Set(currentMatchNodes.value.map(n => n.stageLabel).filter(Boolean));
  let right = 40; // left margin baseline
  labels.forEach(lbl => {
    const b = getStageBounds(lbl);
    if (b) right = Math.max(right, b.maxX);
  });
  return right;
};

const computeColumnAnchor = () => {
  const z = zoom.value || 1;
  const viewOriginX = Math.max(0, Math.round((-panX.value) / z));
  const viewOriginY = Math.max(0, Math.round((-panY.value) / z));

  // If there are any unlabeled nodes (current building stage), keep using their column
  const building = currentMatchNodes.value.filter(n => !n.stageLabel);
  if (building.length > 0) {
    const topY = Math.min(...building.map(n => n.y));
    const bottomY = Math.max(...building.map(n => n.y + (nodeRefs.get(n.id)?.offsetHeight || defaultNodeH)));
    const x = Math.min(...building.map(n => n.x));
    return { baseX: x, baseY: Math.max(viewOriginY + 40, bottomY + rowGap) };
  }

  // Otherwise, start a new column: right to the last locked stage
  const lastRight = getLastLockedRightEdge();
  const baseX = Math.min(lastRight + columnGap, workspaceWidth.value - defaultNodeW);
  const baseY = viewOriginY + 40;
  return { baseX, baseY };
};

const computeNextNodePositionInColumn = (offsetIndex = 0) => {
  const { baseX, baseY } = computeColumnAnchor();
  const x = baseX;
  const y = baseY + offsetIndex * (defaultNodeH + rowGap);
  return {
    x: Math.max(0, Math.min(x, workspaceWidth.value - defaultNodeW)),
    y: Math.max(0, Math.min(y, workspaceHeight.value - defaultNodeH))
  };
};

const startNodeDrag = (event, match) => {
  if (event.target.closest('.delete-btn') || event.target.closest('.connect-btn')) return;
  
  event.preventDefault();
  event.stopPropagation();
  
  isDragging.value = true;
  dragTarget.value = match;
  
  const rect = canvasContainer.value.getBoundingClientRect();
  const offsetX = event.clientX - rect.left - match.x;
  const offsetY = event.clientY - rect.top - match.y;
  
  dragTarget.value.offsetX = offsetX;
  dragTarget.value.offsetY = offsetY;
};

// Canvas interactions
const onPointerDown = (event) => {
  const isOnNode = !!event.target.closest('.match-node');
  if (!isOnNode) {
    isPanning.value = true;
    lastPointerX.value = event.clientX;
    lastPointerY.value = event.clientY;
  }
};

const onPointerMove = (event) => {
  if (isDragging.value && dragTarget.value) {
    const rect = canvasContainer.value.getBoundingClientRect();
    const newX = event.clientX - rect.left - (dragTarget.value.offsetX || 0);
    const newY = event.clientY - rect.top - (dragTarget.value.offsetY || 0);
    
    // Snap to grid and keep in bounds
    const snappedX = Math.round(newX / gridSize) * gridSize;
    const snappedY = Math.round(newY / gridSize) * gridSize;
    const maxX = workspaceWidth.value - 260;
    const maxY = workspaceHeight.value - 160;
    dragTarget.value.x = Math.max(0, Math.min(snappedX, maxX));
    dragTarget.value.y = Math.max(0, Math.min(snappedY, maxY));
    
    updateConnections();
    return;
  }

  if (isPanning.value) {
    const dx = event.clientX - lastPointerX.value;
    const dy = event.clientY - lastPointerY.value;
    panX.value += dx;
    panY.value += dy;
    lastPointerX.value = event.clientX;
    lastPointerY.value = event.clientY;
  }
};

const onPointerUp = (event) => {
  if (isDragging.value) {
    isDragging.value = false;
    dragTarget.value = null;
  }
  isPanning.value = false;
};

// Touch handlers
const handleCanvasTouchStart = (event) => {
  event.preventDefault();
  if (event.touches.length === 1) {
    const touch = event.touches[0];
    const mouseEvent = { clientX: touch.clientX, clientY: touch.clientY };
    handleCanvasMouseDown(mouseEvent);
  }
};
const handleCanvasTouchMove = (event) => {
  event.preventDefault();
  if (event.touches.length === 1) {
    const touch = event.touches[0];
    const mouseEvent = { clientX: touch.clientX, clientY: touch.clientY };
    handleCanvasMouseMove(mouseEvent);
  }
};
const handleCanvasTouchEnd = (event) => {
  event.preventDefault();
  const mouseEvent = { clientX: 0, clientY: 0 };
  handleCanvasMouseUp(mouseEvent);
};

// Mouse wheel zoom
const handleCanvasWheel = (event) => {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom.value + delta));
    if (newZoom !== zoom.value) {
      zoom.value = newZoom;
    }
  }
};

const handleCanvasClick = (event) => {
  if (connectionMode.value && connectionSource.value) {
    // Clicking empty canvas cancels
    connectionMode.value = false;
    connectionSource.value = null;
  }
};

const setMatchNodeRef = (id, el) => { if (el) nodeRefs.set(id, el); else nodeRefs.delete(id); };

const handleNodeClick = (match) => {
  if (!connectionMode.value || !connectionSource.value) return;
  if (connectionSource.value.id === match.id) return; // ignore self
  createConnection(connectionSource.value, match);
  connectionMode.value = false;
  connectionSource.value = null;
};

// Stage locking
const stageName = ref('');
const lockedStages = ref([]); // { name, nodeIds }
const lockCurrentStage = () => {
  if (!stageName.value) return;
  const ids = currentMatchNodes.value.filter(m => !m.stageLabel).map(m => m.id);
  lockedStages.value.push({ name: stageName.value, nodeIds: ids });
  currentMatchNodes.value.forEach(m => { if (!m.stageLabel) m.stageLabel = stageName.value; });
  stageName.value = '';
};

// Match management
const addMatchNodes = (count = 1) => {
  const n = Math.max(1, Number(count) || 1);
  for (let i = 0; i < n; i++) {
    const pos = computeNextNodePositionInColumn(i);
    const newMatch = {
      id: Date.now() + i,
      ...pos,
      places: new Array(bracketFormat.value === 'АПФ' ? 2 : 4).fill(''),
      teams: new Array(bracketFormat.value === 'АПФ' ? 2 : 4).fill(null),
      winner: null
    };
    if (activeCanvas.value === 'alpha') matchNodes.value.push(newMatch); else ldMatchNodes.value.push(newMatch);
  }
  nextTick(updateConnections);
};

const deleteMatch = (matchId) => {
  if (activeCanvas.value === 'alpha') {
    matchNodes.value = matchNodes.value.filter(m => m.id !== matchId);
    connections.value = connections.value.filter(c => c.from !== matchId && c.to !== matchId);
  } else {
    ldMatchNodes.value = ldMatchNodes.value.filter(m => m.id !== matchId);
    ldConnections.value = ldConnections.value.filter(c => c.from !== matchId && c.to !== matchId);
  }
  updateConnections();
};

// Team assignment based on places
const getTeamByPlace = (place) => {
  if (!place || place < 1 || place > availableTeams.value.length) return null;
  return availableTeams.value[place - 1];
};
const updateMatchTeams = (match) => { match.teams = match.places.map(place => getTeamByPlace(place)); };

// LD Speaker assignment based on places
const getSpeakerByPlace = (place) => {
  if (!place || place < 1 || place > availableSpeakers.value.length) return null;
  return availableSpeakers.value[place - 1];
};
const updateMatchSpeakers = (match) => {
  match.teams = match.places.map(place => {
    const s = getSpeakerByPlace(place);
    return s ? { reg_id: s.username || s.id, faction_name: s.username } : null;
  });
};

// Connection management
const connectToNext = (match) => {
  connectionMode.value = true;
  connectionSource.value = match;
};

const createConnection = (fromMatch, toMatch) => {
  const conns = currentConnections.value;
  if (conns.some(c => c.from === fromMatch.id && c.to === toMatch.id)) {
    connectionMode.value = false;
    connectionSource.value = null;
    return;
  }
  const connection = { id: Date.now(), from: fromMatch.id, to: toMatch.id, x1: 0, y1: 0, x2: 0, y2: 0, d: '' };
  if (activeCanvas.value === 'alpha') connections.value.push(connection); else ldConnections.value.push(connection);
  updateConnections();
};

const updateConnections = () => {
  const recompute = (nodesArr, connsArr) => {
    connsArr.forEach(connection => {
      const fromMatch = nodesArr.find(m => m.id === connection.from);
      const toMatch = nodesArr.find(m => m.id === connection.to);
      if (fromMatch && toMatch) {
        const fromEl = nodeRefs.get(fromMatch.id);
        const toEl = nodeRefs.get(toMatch.id);
        const fw = fromEl?.offsetWidth || 220;
        const fh = fromEl?.offsetHeight || 140;
        const tw = toEl?.offsetWidth || 220;
        const th = toEl?.offsetHeight || 140;
        const x1 = fromMatch.x + fw / 2;
        const y1 = fromMatch.y + fh / 2;
        const x2 = toMatch.x + tw / 2;
        const y2 = toMatch.y + th / 2;
        const mx = (x1 + x2) / 2;
        connection.x1 = x1; connection.y1 = y1; connection.x2 = x2; connection.y2 = y2;
        connection.d = `M ${x1},${y1} C ${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      }
    });
  };
  nextTick(() => {
    recompute(matchNodes.value, connections.value);
    recompute(ldMatchNodes.value, ldConnections.value);
  });
};

// Bracket management
const clearBracket = () => {
  if (confirm('Are you sure you want to clear the entire bracket?')) {
    if (activeCanvas.value === 'alpha') { matchNodes.value = []; connections.value = []; }
    else { ldMatchNodes.value = []; ldConnections.value = []; }
  }
};

// Zoom functions
const zoomIn = () => { if (zoom.value < maxZoom) { zoom.value = Math.min(maxZoom, zoom.value + 0.25); } };
const zoomOut = () => { if (zoom.value > minZoom) { zoom.value = Math.max(minZoom, zoom.value - 0.25); } };
const resetZoom = () => { zoom.value = 1; };

const saveBracket = () => {
  const bracketData = {
    format: bracketFormat.value,
    ldEnabled: ldEnabled.value,
    alpha: { matches: matchNodes.value, connections: connections.value },
    ld: ldEnabled.value ? { matches: ldMatchNodes.value, connections: ldConnections.value } : null
  };
  emit('save', bracketData);
};

const loadBracket = (bracketData) => {
  if (!bracketData) return;
  bracketFormat.value = bracketData.format || 'АПФ';
  if (bracketData.alpha) {
    matchNodes.value = bracketData.alpha.matches || [];
    connections.value = bracketData.alpha.connections || [];
  } else {
    // backward compatibility
    matchNodes.value = bracketData.matches || [];
    connections.value = bracketData.connections || [];
  }
  if (bracketData.ld) {
    ldEnabled.value = true;
    ldMatchNodes.value = bracketData.ld.matches || [];
    ldConnections.value = bracketData.ld.connections || [];
  }
};

// Watch for format changes
watch(bracketFormat, (newFormat) => {
  const reconfigure = (arr) => arr.forEach(match => {
    const teamsPerMatch = newFormat === 'АПФ' ? 2 : 4;
    if (match.places.length !== teamsPerMatch) {
      match.places = new Array(teamsPerMatch).fill('');
      match.teams = new Array(teamsPerMatch).fill(null);
      match.winner = null;
    }
  });
  reconfigure(matchNodes.value);
  reconfigure(ldMatchNodes.value);
});
</script>

<style scoped>
.bracket-constructor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1a1a1a;
  /* Break out of parent padding to use full viewport width */
  width: 100vw;
  margin-left: calc(50% - 50vw);
  margin-right: calc(50% - 50vw);
}

.bracket-constructor.fullscreen { position: fixed; inset: 0; z-index: 9999; height: 100vh; width: 100vw; }

.top-toolbar { position: sticky; top: 0; z-index: 20; display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; backdrop-filter: saturate(120%) blur(8px); background: linear-gradient(180deg, rgba(27,27,35,.85), rgba(21,21,28,.85)); border-bottom: 1px solid rgba(120,120,160,.25); height: auto; min-height: 72px; flex-shrink: 0; flex-wrap: wrap; gap: 14px; box-shadow: 0 6px 18px rgba(0,0,0,.35); }
.toolbar-left { display: flex; align-items: center; gap: 15px; flex: 1; min-width: 200px; }
.toolbar-left h3 { color: #e6e1ff; margin: 0; font-size: 20px; letter-spacing: .4px; text-shadow: 0 2px 12px rgba(139,92,246,.35); }
.toolbar-right { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: flex-end; }
.round-league-controls { display: flex; gap: 10px; align-items: center; background: linear-gradient(180deg, rgba(35,35,48,.9), rgba(28,28,40,.9)); border: 1px solid rgba(120,120,160,.35); padding: 10px 12px; border-radius: 12px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.02); }
.round-league-controls .control { display: flex; gap: 6px; align-items: center; }
.round-league-controls label { color: #cfd1ff; font-size: 12px; opacity: .9; }
.round-league-controls .stage-input { background: #151520; color: #fff; border: 1px solid #404062; border-radius: 10px; padding: 8px 10px; box-shadow: inset 0 1px 0 rgba(255,255,255,.04); }
.canvas-tabs { display: flex; background: #262636; border: 1px solid #3f3f68; border-radius: 8px; overflow: hidden; }
.tab-btn { padding: 6px 10px; background: transparent; color: #bdbde8; border: none; cursor: pointer; font-size: 12px; }
.tab-btn.active { background: #3a3a58; color: #fff; }

.zoom-controls { display: flex; align-items: center; gap: 0; background: linear-gradient(180deg,#222232,#1a1a28); padding: 6px; border-radius: 999px; border: 1px solid rgba(120,120,160,.35); box-shadow: inset 0 0 0 1px rgba(255,255,255,.02); }
.zoom-btn { background: transparent; border: none; color: #fff; width: 36px; height: 36px; border-radius: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: bold; }
.zoom-btn:hover { background: rgba(139,92,246,.15); }
.zoom-level { color: #d7d7ff; font-size: 12px; min-width: 64px; text-align: center; letter-spacing: .3px; }
.add-nodes-group { display: flex; align-items: center; gap: 6px; }
.count-input { width: 70px; padding: 8px 10px; background: #151520; border: 1px solid #404062; border-radius: 12px; color: #fff; text-align: center; box-shadow: inset 0 1px 0 rgba(255,255,255,.04); }

@media (max-width: 768px) {
  .top-toolbar { flex-direction: column; height: auto; padding: 10px; }
  .toolbar-left { width: 100%; justify-content: center; margin-bottom: 10px; }
  .toolbar-right { width: 100%; justify-content: center; }
  .toolbar-left h3 { font-size: 14px; }
  .tool-btn { padding: 6px 12px; font-size: 12px; }
  .zoom-controls { order: -1; width: 100%; justify-content: center; margin-bottom: 10px; }
  .zoom-btn { width: 25px; height: 25px; font-size: 12px; }
}

.format-selector { display: flex; align-items: center; gap: 10px; }
.format-selector label { color: #ddd9ff; font-size: 14px; }
.format-selector select { padding: 10px 12px; background: #1b1b28; border: 1px solid #3e3e60; border-radius: 12px; color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,.04); }

.tool-btn { padding: 10px 18px; background: linear-gradient(180deg,#27273a,#1f1f2e); border: 1px solid #454565; border-radius: 12px; color: #fff; cursor: pointer; font-size: 14px; white-space: nowrap; transition: transform .06s ease, background .2s ease; box-shadow: 0 4px 12px rgba(0,0,0,.25); }
.tool-btn:hover { background: linear-gradient(180deg,#2e2e45,#232336); }
.tool-btn:active { transform: translateY(1px); }
.tool-btn.primary { background: linear-gradient(180deg,#8b5cf6,#7c3aed); border-color: #7c3aed; box-shadow: 0 8px 18px rgba(124,58,237,.35); }
.tool-btn.primary:hover { background: linear-gradient(180deg,#9b6bff,#8652ff); }
.tool-btn.success { background: linear-gradient(180deg,#2bd970,#19b956); border-color: #16a34a; box-shadow: 0 8px 18px rgba(34,197,94,.35); }
.tool-btn.success:hover { background: linear-gradient(180deg,#34f07d,#1fc962); }
.tool-btn.danger { background: linear-gradient(180deg,#ff5b5b,#dc2626); border-color: #dc2626; box-shadow: 0 8px 18px rgba(239,68,68,.35); }
.tool-btn.danger:hover { background: linear-gradient(180deg,#ff6b6b,#e22f2f); }

.canvas-container { flex: 1; position: relative; background:
  radial-gradient(circle at 1px 1px, rgba(120,120,160,.25) 1px, transparent 1px) 0 0/20px 20px,
  linear-gradient(180deg, #141418, #101016); overflow: hidden; width: 100%; height: calc(100vh - 90px); border-top: 1px solid rgba(120,120,160,.15); }

@media (max-width: 768px) { .canvas-container { height: calc(100vh - 120px); } }

.bracketCanvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; max-width: 100%; max-height: 100%; }

.match-node { position: absolute; width: auto; min-width: 260px; background: linear-gradient(180deg, rgba(24,24,24,.95), rgba(18,18,18,.95)); border: 1px solid rgba(139,92,246,.35); border-radius: 12px; padding: 10px 12px; cursor: move; user-select: none; z-index: 10; box-shadow: 0 8px 24px rgba(0,0,0,.5), 0 0 24px rgba(139,92,246,.15); }
@media (max-width: 768px) { .match-node { width: 150px; padding: 8px; font-size: 12px; } }
.match-node:hover { border-color: #8b5cf6; box-shadow: 0 10px 28px rgba(0,0,0,.6), 0 0 32px rgba(139,92,246,.3); }
.match-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.meta-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.league-badge { padding: 2px 6px; font-size: 11px; border-radius: 6px; background: #2f2f3f; color: #cfcfff; border: 1px solid #49497a; }
.league-badge.beta { background: #2f3f2f; border-color: #497a49; }
.round-select { background: #1f1f2a; color: #fff; border: 1px solid #474766; border-radius: 6px; padding: 4px 6px; font-size: 12px; }
.node-drag-handle { width: 18px; height: 18px; border-radius: 4px; background: rgba(139,92,246,.15); border: 1px solid rgba(139,92,246,.4); display: flex; align-items: center; justify-content: center; margin-right: 8px; cursor: grab; }
.node-drag-handle:active { cursor: grabbing; }
.node-drag-handle .grip { width: 8px; height: 8px; background: rgba(139,92,246,.8); box-shadow: 0 0 8px rgba(139,92,246,.8); }
.match-title { color: #e5e0ff; font-weight: 700; font-size: 13px; letter-spacing: .3px; }
.delete-btn { background: linear-gradient(180deg,#ef4444,#b91c1c); border: none; border-radius: 50%; width: 20px; height: 20px; color: white; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(239,68,68,.35); }
.delete-btn:hover { background: #dc2626; }
.match-places { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.place-slot { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; background: rgba(40,40,60,.6); border: 1px solid rgba(120,120,160,.35); border-radius: 8px; }
.place-slot label { color: #ccc; font-size: 11px; font-weight: 600; }
.place-slot select { padding: 6px 8px; background: #1f1f2a; border: 1px solid #474766; border-radius: 6px; color: #e8e8ff; font-size: 12px; width: 100%; }
.assigned-team { color: #bdaaff; font-size: 11px; font-weight: 700; padding: 4px 6px; background: rgba(139, 92, 246, 0.15); border-radius: 6px; }
.match-actions { display: flex; gap: 5px; }
.match-actions button { flex: 1; padding: 6px 10px; background: #555; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 11px; }
.match-actions button.active { background: #8b5cf6; }
.connection-lines { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; filter: drop-shadow(0 0 8px rgba(139,92,246,.25)); }
.round-columns { display: none; }
.round-col { display: none; }
.round-label { display: none; }
.stage-badge { padding: 2px 6px; font-size: 11px; border-radius: 6px; background: #232334; color: #cfcfff; border: 1px solid #49497a; }
.connection-mode { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #8b5cf6; color: white; padding: 20px; border-radius: 8px; z-index: 1000; pointer-events: none; }
</style>
