import { supabase, getAdminStatus, SUPABASE_URL, SITE_MEDIA_BUCKET } from './supabase-client.js';

const imageFitField = { name: 'image_fit', label: 'Fit to frame', type: 'select', options: [['cover', 'Fill and crop'], ['contain', 'Show full image']] };
const postImageFitField = { name: 'image_fit', label: 'Fit to frame', type: 'select', options: [['cover', 'Fill and crop'], ['auto', 'Automatic'], ['contain', 'Show full image']] };
const imageAdjustmentFields = [
  { name: 'image_zoom_x', label: 'Horizontal zoom', type: 'range', min: 100, max: 200 },
  { name: 'image_zoom_y', label: 'Vertical zoom', type: 'range', min: 100, max: 200 },
  { name: 'image_position_x', label: 'Horizontal position', type: 'range', min: 0, max: 100 },
  { name: 'image_position_y', label: 'Vertical position', type: 'range', min: 0, max: 100 }
];

const modules = {
  posts: {
    label: 'News & events',
    singular: 'story',
    table: 'site_posts',
    order: ['created_at', false],
    title: (item) => item.title || 'Untitled story',
    subtitle: (item) => `${item.kind || 'news'} · ${item.status || 'draft'}`,
    status: (item) => item.status,
    fields: [
      { name: 'kind', label: 'Content type', type: 'select', options: [['news', 'News'], ['event', 'Event']] },
      { name: 'status', label: 'Publishing status', type: 'select', options: [['draft', 'Draft'], ['published', 'Published'], ['archived', 'Archived']] },
      { name: 'title', label: 'Title', required: true, max: 180 },
      { name: 'slug', label: 'URL slug', required: true, max: 180, wide: true },
      { name: 'excerpt', label: 'Summary', type: 'textarea', required: true, max: 500, wide: true },
      { name: 'body', label: 'Story details', type: 'textarea', max: 12000, wide: true },
      { name: 'event_date', label: 'Event date', type: 'datetime-local' },
      { name: 'image_file', label: 'Featured image', type: 'file', accept: 'image/jpeg,image/png,image/webp', wide: true },
      { name: 'image_alt', label: 'Image description', max: 240, wide: true },
      { name: 'image_template', label: 'Image frame', type: 'select', options: [['news-4x3', 'News · 4:3'], ['poster-2x3', 'Poster · 2:3'], ['square-1x1', 'Square · 1:1'], ['banner-16x9', 'Banner · 16:9']] },
      postImageFitField,
      ...imageAdjustmentFields
    ]
  },
  sections: {
    label: 'Page sections', singular: 'section', table: 'site_sections', order: ['page_slug', true],
    title: (item) => item.title || item.section_key || 'Untitled section',
    subtitle: (item) => `${item.page_slug || 'page'} / ${item.section_key || 'section'}`,
    status: (item) => item.is_published ? 'published' : 'draft',
    fields: [
      { name: 'page_slug', label: 'Page', type: 'select', options: [['index', 'Home'], ['about', 'About'], ['college', 'College'], ['programs', 'Programs'], ['gallery', 'Gallery']] },
      { name: 'section_key', label: 'Section', type: 'select', options: [['hero', 'Hero']] },
      { name: 'title', label: 'Title', max: 180 },
      { name: 'subtitle', label: 'Subtitle', max: 300 },
      { name: 'body', label: 'Body', type: 'textarea', max: 12000, wide: true },
      { name: 'image_url', label: 'Image URL', type: 'url', wide: true },
      { name: 'image_file', label: 'Upload image', type: 'file', accept: 'image/jpeg,image/png,image/webp' },
      { name: 'image_template', label: 'Image frame', type: 'select', options: [['hero-16x9', 'Hero · 16:9'], ['feature-4x3', 'Feature · 4:3'], ['square-1x1', 'Square · 1:1']] },
      imageFitField,
      ...imageAdjustmentFields,
      { name: 'is_published', label: 'Visibility', type: 'select', options: [['true', 'Published'], ['false', 'Hidden']] }
    ]
  },
  leadership: {
    label: 'Leadership', singular: 'profile', table: 'leadership', order: ['display_order', true],
    title: (item) => item.full_name || 'Untitled profile',
    subtitle: (item) => item.role_title || item.division || 'Leadership',
    status: (item) => item.is_published ? 'published' : 'draft',
    fields: [
      { name: 'full_name', label: 'Name', required: true, max: 180 },
      { name: 'role_title', label: 'Role', required: true, max: 180 },
      { name: 'division', label: 'Division', type: 'select', options: [['general', 'General'], ['college', 'College'], ['high-school', 'High school'], ['remedial', 'Remedial']] },
      { name: 'display_order', label: 'Display order', type: 'number', min: 0 },
      { name: 'bio', label: 'Biography', type: 'textarea', max: 5000, wide: true },
      { name: 'photo_url', label: 'Photo URL', type: 'url', wide: true },
      { name: 'photo_file', label: 'Upload portrait', type: 'file', accept: 'image/jpeg,image/png,image/webp' },
      { name: 'image_template', label: 'Image frame', type: 'select', options: [['portrait-3x4', 'Portrait · 3:4'], ['square-1x1', 'Square · 1:1']] },
      imageFitField,
      ...imageAdjustmentFields,
      { name: 'is_published', label: 'Visibility', type: 'select', options: [['true', 'Published'], ['false', 'Hidden']] }
    ]
  },
  gallery: {
    label: 'Gallery', singular: 'image', table: 'gallery_items', order: ['display_order', true],
    title: (item) => item.title || 'Untitled image',
    subtitle: (item) => item.category || 'General',
    status: (item) => item.is_published ? 'published' : 'draft',
    fields: [
      { name: 'title', label: 'Title', required: true, max: 180 },
      { name: 'category', label: 'Category', max: 100 },
      { name: 'display_order', label: 'Display order', type: 'number', min: 0 },
      { name: 'caption', label: 'Caption', type: 'textarea', max: 500, wide: true },
      { name: 'image_url', label: 'Image URL', type: 'url', wide: true },
      { name: 'image_file', label: 'Upload image', type: 'file', accept: 'image/jpeg,image/png,image/webp' },
      { name: 'image_template', label: 'Image frame', type: 'select', options: [['gallery-4x3', 'Gallery · 4:3'], ['portrait-3x4', 'Portrait · 3:4'], ['square-1x1', 'Square · 1:1']] },
      imageFitField,
      ...imageAdjustmentFields,
      { name: 'is_published', label: 'Visibility', type: 'select', options: [['true', 'Published'], ['false', 'Hidden']] }
    ]
  }
};

const elements = {
  list: document.getElementById('contentList'),
  form: document.getElementById('contentForm'),
  fields: document.getElementById('editorFields'),
  empty: document.getElementById('emptyEditor'),
  notice: document.getElementById('cmsNotice'),
  connection: document.getElementById('connectionStatus'),
  title: document.getElementById('editorTitle'),
  eyebrow: document.getElementById('editorEyebrow'),
  libraryTitle: document.getElementById('libraryTitle'),
  itemCount: document.getElementById('itemCount'),
  save: document.getElementById('saveButton'),
  delete: document.getElementById('deleteButton')
};

let activeType = 'posts';
let activeRecords = [];
let selectedRecord = null;
let currentUser = null;
let previewObjectUrl = null;

function showNotice(message, kind = 'error') {
  elements.notice.textContent = message;
  elements.notice.className = `cms-notice ${kind === 'error' ? 'is-error' : `is-${kind}`}`;
  elements.notice.hidden = false;
}

function clearNotice() {
  elements.notice.hidden = true;
  elements.notice.textContent = '';
}

function setConnection(label, state) {
  const indicator = elements.connection.querySelector('i');
  elements.connection.replaceChildren(indicator, document.createTextNode(label));
  elements.connection.className = `cms-connection${state ? ` is-${state}` : ''}`;
}

function safeDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function setFieldValue(field, value) {
  if (field.type === 'datetime-local' && value) {
    const date = new Date(value);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }
  if (field.type === 'file') return '';
  if (field.type === 'select' && typeof value === 'boolean') return String(value);
  return value ?? '';
}

function createField(field, record = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = `cms-field${field.wide ? ' is-wide' : ''}`;
  const label = document.createElement('label');
  const id = `field-${field.name}`;
  label.htmlFor = id;
  label.textContent = field.label;
  wrapper.appendChild(label);

  let control;
  if (field.type === 'textarea') {
    control = document.createElement('textarea');
    control.rows = field.name === 'body' ? 7 : 4;
  } else if (field.type === 'select') {
    control = document.createElement('select');
    field.options.forEach(([value, text]) => control.add(new Option(text, value)));
  } else {
    control = document.createElement('input');
    control.type = field.type || 'text';
    if (field.type === 'file') control.accept = field.accept;
    if (field.min !== undefined) control.min = field.min;
    if (field.max !== undefined && field.type !== 'range') control.maxLength = field.max;
    if (field.type === 'range') {
      control.min = field.min;
      control.max = field.max;
      control.value = record[field.name] ?? (field.name.includes('zoom') ? 100 : 50);
      const output = document.createElement('output');
      output.className = 'float-end';
      output.htmlFor = id;
      output.textContent = `${control.value}${field.name.includes('zoom') ? '%' : '%'}`;
      control.addEventListener('input', () => { output.value = `${control.value}%`; });
      wrapper.appendChild(output);
    }
  }

  control.id = id;
  control.name = field.name;
  control.dataset.field = field.name;
  if (field.required) control.required = true;
  if (field.type !== 'file' && field.type !== 'range' && !(field.type === 'select' && record[field.name] === undefined)) {
    control.value = setFieldValue(field, record[field.name]);
  }
  if (field.type === 'number' && record[field.name] === undefined) control.value = '0';
  if (field.type === 'url' && field.name === 'image_url') control.placeholder = 'https://...';
  if (field.type === 'file') control.className = 'form-control';
  else if (field.type !== 'range') control.className = field.type === 'select' ? 'form-select' : 'form-control';
  if (field.type === 'file') {
    const hint = document.createElement('small');
    hint.className = 'form-text d-block';
    hint.textContent = 'JPG, PNG, or WebP · up to 5 MB';
    wrapper.append(control, hint);
  } else {
    wrapper.appendChild(control);
  }
  return wrapper;
}

function renderForm(record = null) {
  const module = modules[activeType];
  elements.fields.replaceChildren(...module.fields.map((field) => createField(field, record || {})));
  selectedRecord = record;
  elements.form.hidden = false;
  elements.empty.hidden = true;
  elements.delete.hidden = !record;
  elements.title.textContent = record ? module.title(record) : `New ${module.singular}`;
  elements.eyebrow.textContent = record ? 'Editing existing content' : `Create ${module.singular}`;
  elements.save.querySelector('span').textContent = record ? 'Save changes' : 'Create item';
  updateMediaPreview(record);
  clearNotice();
}

function applyMediaPreviewControls() {
  const template = elements.form.elements.image_template?.value || 'gallery-4x3';
  const ratios = {
    'news-4x3': '4 / 3',
    'poster-2x3': '2 / 3',
    'square-1x1': '1 / 1',
    'banner-16x9': '16 / 9',
    'hero-16x9': '16 / 9',
    'feature-4x3': '4 / 3',
    'portrait-3x4': '3 / 4',
    'gallery-4x3': '4 / 3'
  };
  const frame = document.getElementById('mediaPreviewFrame');
  const image = document.getElementById('mediaPreviewImage');
  const zoomX = Number(elements.form.elements.image_zoom_x?.value || 100);
  const zoomY = Number(elements.form.elements.image_zoom_y?.value || 100);
  const positionX = Number(elements.form.elements.image_position_x?.value || 50);
  const positionY = Number(elements.form.elements.image_position_y?.value || 50);

  frame.style.aspectRatio = ratios[template] || '4 / 3';
  image.style.objectFit = elements.form.elements.image_fit?.value === 'contain' ? 'contain' : 'cover';
  image.style.objectPosition = `${positionX}% ${positionY}%`;
  image.style.transform = `scale(${zoomX / 100}, ${zoomY / 100})`;
}

function updateMediaPreview(record = null, file = null) {
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = file ? URL.createObjectURL(file) : null;

  let imageUrl = previewObjectUrl;
  if (!imageUrl && activeType === 'posts' && record?.image_path) {
    imageUrl = /^https?:\/\//i.test(record.image_path)
      ? record.image_path
      : supabase.storage.from('site-media').getPublicUrl(record.image_path).data.publicUrl;
  } else if (!imageUrl && activeType === 'leadership') {
    imageUrl = elements.form.elements.photo_url?.value || record?.photo_url;
  } else if (!imageUrl && activeType !== 'posts') {
    imageUrl = elements.form.elements.image_url?.value || record?.image_url;
  }

  const preview = document.getElementById('mediaPreview');
  const image = document.getElementById('mediaPreviewImage');
  preview.hidden = !imageUrl;
  if (!imageUrl) {
    image.removeAttribute('src');
    return;
  }

  image.src = imageUrl;
  image.alt = activeType === 'posts' ? (record?.image_alt || record?.title || file?.name || 'Content image preview') : (record?.title || record?.full_name || file?.name || 'Content image preview');
  document.getElementById('mediaPreviewLabel').textContent = file?.name || 'Current image';
  applyMediaPreviewControls();
}

function renderList() {
  const module = modules[activeType];
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const records = activeRecords.filter((record) => `${module.title(record)} ${module.subtitle(record)}`.toLowerCase().includes(query));
  elements.list.replaceChildren();
  elements.itemCount.textContent = `${activeRecords.length} ${activeRecords.length === 1 ? 'item' : 'items'}`;

  if (!records.length) {
    const message = document.createElement('p');
    message.className = 'cms-list-message';
    message.textContent = query ? 'No matching items.' : `No ${module.label.toLowerCase()} yet. Create the first one.`;
    elements.list.appendChild(message);
    return;
  }

  records.forEach((record) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cms-list-item${selectedRecord?.id === record.id ? ' is-selected' : ''}`;
    const title = document.createElement('strong');
    title.textContent = module.title(record);
    const subtitle = document.createElement('small');
    subtitle.textContent = module.subtitle(record);
    const status = document.createElement('span');
    const statusValue = module.status(record) || 'draft';
    status.className = `cms-status is-${statusValue}`;
    status.textContent = statusValue;
    button.append(title, subtitle, status);
    button.addEventListener('click', () => renderForm(record));
    elements.list.appendChild(button);
  });
}

async function loadRecords() {
  const module = modules[activeType];
  elements.list.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'cms-list-message';
  loading.textContent = 'Loading content...';
  elements.list.appendChild(loading);
  setConnection('Loading', '');
  const [orderColumn, ascending] = module.order;
  const { data, error } = await supabase.from(module.table).select('*').order(orderColumn, { ascending });
  if (error) {
    activeRecords = [];
    setConnection('Connection issue', 'error');
    showNotice(`Could not load ${module.label.toLowerCase()}. Check the Supabase schema and content access policies, then refresh.`, 'error');
    elements.list.replaceChildren();
    const message = document.createElement('p');
    message.className = 'cms-list-message';
    message.textContent = 'Content could not be loaded. Refresh after checking database access.';
    elements.list.appendChild(message);
    elements.itemCount.textContent = 'Unavailable';
    return;
  }

  activeRecords = data || [];
  setConnection('Connected', 'connected');
  clearNotice();
  renderList();
}

function slugify(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180);
}

async function uploadImage(file, folder) {
  if (!file) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a JPG, PNG, or WebP image under 5 MB.');
  }
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('site-media').upload(path, file, {
    cacheControl: '3600', contentType: file.type, upsert: false
  });
  if (error) throw error;
  return supabase.storage.from('site-media').getPublicUrl(path).data.publicUrl;
}

function collectFormData() {
  return Object.fromEntries(new FormData(elements.form).entries());
}

async function saveRecord(event) {
  event.preventDefault();
  if (!elements.form.reportValidity()) return;
  clearNotice();
  elements.save.disabled = true;
  elements.save.querySelector('span').textContent = 'Saving...';
  const values = collectFormData();
  const module = modules[activeType];
  const fileField = activeType === 'posts' ? 'image_file' : activeType === 'leadership' ? 'photo_file' : 'image_file';
  const file = elements.form.elements[fileField]?.files[0];

  try {
    const payload = {};
    for (const field of module.fields) {
      if (field.type === 'file') continue;
      let value = values[field.name];
      if (field.type === 'number') value = Number(value || 0);
      if (field.name === 'is_published') value = value === 'true';
      if (field.name === 'event_date') value = value ? new Date(value).toISOString() : null;
      if (value === '' && field.type !== 'url') value = '';
      payload[field.name] = value;
    }

    if (activeType === 'posts') {
      payload.slug = slugify(values.slug || values.title);
      if (!payload.slug) payload.slug = `story-${crypto.randomUUID()}`;
      payload.created_by = selectedRecord?.created_by || currentUser.id;
      payload.published_at = payload.status === 'published'
        ? selectedRecord?.published_at || new Date().toISOString()
        : null;
    }

    if (file) {
      const folder = activeType === 'posts' ? 'news' : activeType === 'leadership' ? 'leadership' : activeType === 'sections' ? 'page-sections' : 'gallery';
      const url = await uploadImage(file, folder);
      if (activeType === 'posts') payload.image_path = url.split('/site-media/')[1];
      else if (activeType === 'leadership') payload.photo_url = url;
      else payload.image_url = url;
    }

    if (activeType === 'gallery' && !payload.image_url) throw new Error('Add an image URL or upload an image.');
    const request = selectedRecord
      ? supabase.from(module.table).update(payload).eq('id', selectedRecord.id)
      : supabase.from(module.table).insert(payload);
    const { error } = await request;
    if (error) throw error;
    showNotice(`${module.singular[0].toUpperCase()}${module.singular.slice(1)} saved.`, 'success');
    elements.form.hidden = true;
    elements.empty.hidden = false;
    elements.delete.hidden = true;
    elements.title.textContent = 'Choose an item to edit';
    elements.eyebrow.textContent = 'Content item';
    selectedRecord = null;
    await loadRecords();
  } catch (error) {
    showNotice(error.message || `Could not save this ${module.singular}. Check permissions and try again.`, 'error');
  } finally {
    elements.save.disabled = false;
    elements.save.querySelector('span').textContent = selectedRecord ? 'Save changes' : 'Create item';
  }
}

function getManagedMediaPath(value, allowRelativePath = false) {
  if (typeof value !== 'string' || !value) return null;

  let path = value;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.origin !== new URL(SUPABASE_URL).origin) return null;
      const marker = `/storage/v1/object/public/${SITE_MEDIA_BUCKET}/`;
      const markerIndex = url.pathname.indexOf(marker);
      if (markerIndex < 0) return null;
      path = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    } catch {
      return null;
    }
  } else if (!allowRelativePath) {
    return null;
  }

  const managedPath = /^(news|page-sections|leadership|gallery)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,8}$/i;
  return managedPath.test(path) ? path : null;
}

async function hasOtherMediaReferences(storagePath, deletedTable, deletedId) {
  const references = [
    { table: 'site_posts', column: 'image_path', allowRelativePath: true },
    { table: 'site_sections', column: 'image_url' },
    { table: 'leadership', column: 'photo_url' },
    { table: 'gallery_items', column: 'image_url' }
  ];

  for (const reference of references) {
    const { data, error } = await supabase
      .from(reference.table)
      .select(`id, ${reference.column}`);
    if (error) return { referenced: true, error };

    const isReferenced = (data || []).some((record) => {
      if (reference.table === deletedTable && record.id === deletedId) return false;
      return getManagedMediaPath(record[reference.column], reference.allowRelativePath) === storagePath;
    });
    if (isReferenced) return { referenced: true, error: null };
  }

  return { referenced: false, error: null };
}

async function deleteRecord() {
  if (!selectedRecord) return;
  const module = modules[activeType];
  const record = selectedRecord;
  const mediaValue = activeType === 'posts'
    ? record.image_path
    : activeType === 'leadership'
      ? record.photo_url
      : record.image_url;
  const storagePath = getManagedMediaPath(mediaValue, activeType === 'posts');
  if (!window.confirm(`Delete “${module.title(record)}”? Its uploaded image will also be removed if no other content uses it.`)) return;
  elements.delete.disabled = true;
  const { error } = await supabase.from(module.table).delete().eq('id', record.id);
  elements.delete.disabled = false;
  if (error) {
    showNotice(`Could not delete this ${module.singular}. Check permissions and try again.`, 'error');
    return;
  }

  let message = `${module.singular[0].toUpperCase()}${module.singular.slice(1)} deleted.`;
  let cleanupFailed = false;
  if (storagePath) {
    const referenceCheck = await hasOtherMediaReferences(storagePath, module.table, record.id);
    if (referenceCheck.error) {
      message += ' Its image was kept because other content references could not be checked.';
      cleanupFailed = true;
    } else if (referenceCheck.referenced) {
      message += ' Its image was kept because another content item uses it.';
    } else {
      const { error: storageError } = await supabase.storage.from(SITE_MEDIA_BUCKET).remove([storagePath]);
      if (storageError) {
        message += ' The image could not be removed from Storage; check Storage permissions and retry cleanup.';
        cleanupFailed = true;
      } else {
        message += ' Its unused image was removed from Storage.';
      }
    }
  }

  selectedRecord = null;
  elements.form.hidden = true;
  elements.empty.hidden = false;
  elements.delete.hidden = true;
  elements.title.textContent = 'Choose an item to edit';
  elements.eyebrow.textContent = 'Content item';
  await loadRecords();
  showNotice(message, cleanupFailed ? 'error' : 'success');
}

function changeModule(type) {
  if (!modules[type]) return;
  activeType = type;
  selectedRecord = null;
  elements.form.hidden = true;
  elements.empty.hidden = false;
  elements.delete.hidden = true;
  elements.title.textContent = 'Choose an item to edit';
  elements.eyebrow.textContent = 'Content item';
  elements.libraryTitle.textContent = modules[type].label;
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.cms-tab').forEach((tab) => {
    const active = tab.dataset.type === type;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
  loadRecords();
}

async function initialize() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = 'login.html';
      return;
    }
    if (!(await getAdminStatus())) {
      await supabase.auth.signOut();
      window.location.href = 'login.html';
      return;
    }
    currentUser = user;
    await loadRecords();
  } catch (error) {
    setConnection('Unavailable', 'error');
    showNotice('Could not verify your admin session. Sign in again, then retry.', 'error');
  }
}

document.querySelectorAll('.cms-tab').forEach((tab) => tab.addEventListener('click', () => changeModule(tab.dataset.type)));
document.getElementById('newItemButton').addEventListener('click', () => renderForm());
document.getElementById('searchInput').addEventListener('input', renderList);
document.getElementById('cancelButton').addEventListener('click', () => {
  selectedRecord = null;
  elements.form.hidden = true;
  elements.empty.hidden = false;
  elements.delete.hidden = true;
  elements.title.textContent = 'Choose an item to edit';
  elements.eyebrow.textContent = 'Content item';
  renderList();
});
elements.form.addEventListener('submit', saveRecord);
elements.delete.addEventListener('click', deleteRecord);
document.getElementById('signOutButton').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
});

document.getElementById('editorFields').addEventListener('input', (event) => {
  if (event.target.dataset.field === 'title' && activeType === 'posts' && !selectedRecord) {
    const slug = elements.form.elements.slug;
    if (slug && !slug.dataset.edited) slug.value = slugify(event.target.value);
  }
  if (event.target.dataset.field === 'slug') event.target.dataset.edited = 'true';
  if (event.target.dataset.field === 'title' && selectedRecord) elements.title.textContent = event.target.value || 'Untitled';
  if (['image_template', 'image_fit', 'image_zoom_x', 'image_zoom_y', 'image_position_x', 'image_position_y'].includes(event.target.dataset.field)) {
    applyMediaPreviewControls();
  }
  if (['image_url', 'photo_url'].includes(event.target.dataset.field)) updateMediaPreview(selectedRecord);
});
document.getElementById('editorFields').addEventListener('change', (event) => {
  if (event.target.type === 'file') updateMediaPreview(selectedRecord, event.target.files[0] || null);
  if (['image_template', 'image_fit'].includes(event.target.dataset.field)) applyMediaPreviewControls();
});

initialize();
