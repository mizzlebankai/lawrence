import { supabase } from './supabase-client.js';

(() => {
  const client = supabase;

  const fallbackPosts = [
    {
      id: 'fallback-1',
      kind: 'news',
      title: 'Lawrence College announces the new academic year roadmap',
      excerpt: 'A practical guide to the next phase of teaching, mentoring and student support across the school.',
      body: 'A practical guide to the next phase of teaching, mentoring and student support across the school.',
      image_path: '',
      image_alt: 'Lawrence College academic roadmap',
      event_date: '2026-10-02T00:00:00.000Z',
      published_at: '2026-10-02T00:00:00.000Z',
      image_fit: 'cover',
      image_zoom_x: 100,
      image_zoom_y: 100,
      image_position_x: 50,
      image_position_y: 50
    },
    {
      id: 'fallback-2',
      kind: 'news',
      title: 'WASSCE Remedial timetable released for new learners',
      excerpt: 'Students now have access to a structured support plan designed around readiness, discipline and clarity.',
      body: 'Students now have access to a structured support plan designed around readiness, discipline and clarity.',
      image_path: '',
      image_alt: 'WASSCE Remedial timetable',
      event_date: '2026-10-01T00:00:00.000Z',
      published_at: '2026-10-01T00:00:00.000Z',
      image_fit: 'cover',
      image_zoom_x: 100,
      image_zoom_y: 100,
      image_position_x: 50,
      image_position_y: 50
    },
    {
      id: 'fallback-3',
      kind: 'event',
      title: 'Open day for prospective families and students',
      excerpt: 'Visitors can tour the campus, meet faculty and learn how Lawrence supports students through each stage.',
      body: 'Visitors can tour the campus, meet faculty and learn how Lawrence supports students through each stage.',
      image_path: '',
      image_alt: 'Lawrence campus open day',
      event_date: '2026-10-05T00:00:00.000Z',
      published_at: '2026-10-05T00:00:00.000Z',
      image_fit: 'cover',
      image_zoom_x: 100,
      image_zoom_y: 100,
      image_position_x: 50,
      image_position_y: 50
    }
  ];

  const state = {
    filter: 'all',
    homeIndex: 0,
    newsIndex: 0
  };

  const imageUrl = (path) => {
    if (!path) return 'assets/hero.png';
    if (!client) return 'assets/hero.png';
    return client.storage.from('site-media').getPublicUrl(path).data.publicUrl;
  };

  const imageFrameStyle = (image, post) => {
    image.style.objectFit = post.image_fit || 'cover';
    image.style.objectPosition = `${post.image_position_x ?? 50}% ${post.image_position_y ?? 50}%`;
    image.style.transform = `scale(${(post.image_zoom_x ?? 100) / 100}, ${(post.image_zoom_y ?? 100) / 100})`;
  };

  const formatDate = (value) => {
    if (!value) return '';
    return new Date(value).toLocaleDateString('en-GH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const clampExcerpt = (value = '') => {
    const text = value.trim();
    return text.length > 118 ? `${text.slice(0, 115)}...` : text;
  };

  const getDivision = (post) => {
    const haystack = `${post.title || ''} ${post.excerpt || ''} ${post.body || ''}`.toLowerCase();
    if (haystack.includes('remedial')) return { label: 'Remedial', className: 'is-remedial' };
    if (haystack.includes('high school') || haystack.includes('shs')) return { label: 'High School', className: 'is-high-school' };
    if (haystack.includes('college') || haystack.includes('lawrence college') || haystack.includes('bootcamp')) return { label: 'College', className: 'is-college' };
    if (post.kind === 'event') return { label: 'Event', className: 'is-event' };
    return { label: 'School News', className: 'is-default' };
  };

  const makeCarouselCard = (post) => {
    const article = document.createElement('article');
    article.className = 'news-carousel-card';

    const imageWrap = document.createElement('div');
    imageWrap.className = 'news-carousel-image';
    const img = document.createElement('img');
    img.src = imageUrl(post.image_path);
    img.alt = post.image_alt || post.title;
    img.loading = 'lazy';
    imageFrameStyle(img, post);
    imageWrap.appendChild(img);

    const body = document.createElement('div');
    body.className = 'news-carousel-body';

    const tag = document.createElement('span');
    const division = getDivision(post);
    tag.className = `news-carousel-tag ${division.className}`;
    tag.textContent = division.label;

    const meta = document.createElement('div');
    meta.className = 'news-carousel-meta';
    meta.textContent = formatDate(post.event_date || post.published_at);

    const title = document.createElement('h3');
    title.textContent = post.title;

    const excerpt = document.createElement('p');
    excerpt.textContent = clampExcerpt(post.excerpt || post.body || '');

    body.append(tag, meta, title, excerpt);
    article.append(imageWrap, body);
    return article;
  };

  const makeGridCard = (post) => {
    const article = document.createElement('article');
    article.className = 'news-grid-card';

    const media = document.createElement('div');
    media.className = 'news-grid-media';
    const img = document.createElement('img');
    img.src = imageUrl(post.image_path);
    img.alt = post.image_alt || post.title;
    img.loading = 'lazy';
    imageFrameStyle(img, post);
    media.appendChild(img);

    const body = document.createElement('div');
    body.className = 'news-grid-body';

    const tag = document.createElement('span');
    const division = getDivision(post);
    tag.className = `news-grid-tag ${division.className}`;
    tag.textContent = division.label;

    const meta = document.createElement('div');
    meta.className = 'news-grid-meta';
    meta.textContent = formatDate(post.event_date || post.published_at);

    const title = document.createElement('h4');
    title.textContent = post.title;

    const excerpt = document.createElement('p');
    excerpt.textContent = clampExcerpt(post.excerpt || post.body || '');

    body.append(tag, meta, title, excerpt);
    article.append(media, body);
    return article;
  };

  function updateCarousel(track, dots, index) {
    if (!track || !dots) return;
    const cards = Array.from(track.children);
    if (!cards.length) return;
    const cardGap = 20;
    const cardWidth = cards[0].getBoundingClientRect().width + cardGap;
    track.style.transform = `translateX(-${index * cardWidth}px)`;

    Array.from(dots.children).forEach((dot, dotIndex) => {
      dot.classList.toggle('is-active', dotIndex === index);
      dot.setAttribute('aria-current', dotIndex === index ? 'true' : 'false');
    });
  }

  function renderHomeCarousel(posts) {
    const track = document.getElementById('homeNewsTrack');
    const dots = document.getElementById('homeNewsDots');
    if (!track || !dots) return;

    const nextPosts = posts.slice(0, 5);
    if (!nextPosts.length) {
      track.innerHTML = '<p class="news-stack-empty">Recent news will appear here.</p>';
      dots.innerHTML = '';
      return;
    }

    track.innerHTML = '';
    nextPosts.forEach((post) => track.appendChild(makeCarouselCard(post)));

    dots.innerHTML = '';
    nextPosts.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', `View story ${index + 1}`);
      dot.addEventListener('click', () => {
        state.homeIndex = index;
        updateCarousel(track, dots, state.homeIndex);
      });
      dots.appendChild(dot);
    });

    if (state.homeIndex >= nextPosts.length) state.homeIndex = 0;
    updateCarousel(track, dots, state.homeIndex);
  }

  function renderNewsGrid(posts) {
    const grid = document.getElementById('newsPageGrid');
    const filterBar = document.getElementById('newsFilterBar');
    if (!grid || !filterBar) return;

    const filtered = posts.filter((post) => {
      if (state.filter === 'all') return true;
      const haystack = `${post.title || ''} ${post.excerpt || ''} ${post.body || ''}`.toLowerCase();
      const map = {
        college: ['college', 'bootcamp', 'technology', 'lawrence college'],
        'high-school': ['high school', 'shs', 'senior high', 'school'],
        remedial: ['remedial', 'wassce'],
        event: ['event', 'open day', 'fair', 'forum', 'games', 'campus']
      };
      return map[state.filter].some((keyword) => haystack.includes(keyword));
    });

    Array.from(filterBar.querySelectorAll('.news-filter-btn')).forEach((button) => {
      const isActive = button.dataset.filter === state.filter;
      button.classList.toggle('is-active', isActive);
    });

    if (!filtered.length) {
      grid.innerHTML = '<p class="text-secondary">No stories match this category yet.</p>';
      grid.classList.remove('is-single');
      return;
    }

    grid.classList.toggle('is-single', filtered.length === 1);
    grid.replaceChildren(...filtered.map(makeGridCard));
  }

  async function renderPublishedPosts() {
    let data = [...fallbackPosts];
    let error = null;

    if (client) {
      const loadPosts = (includeImageFrame) => client
        .from('site_posts')
        .select(includeImageFrame
          ? 'id, kind, title, excerpt, body, image_path, image_alt, event_date, published_at, image_fit, image_zoom_x, image_zoom_y, image_position_x, image_position_y'
          : 'id, kind, title, excerpt, body, image_path, image_alt, event_date, published_at')
        .eq('status', 'published')
        .lte('published_at', new Date().toISOString())
        .order('published_at', { ascending: false })
        .limit(30);

      let result = await loadPosts(true);
      if (result.error && (result.error.code === 'PGRST204' || result.error.code === '42703')) {
        result = await loadPosts(false);
      }

      if (!result.error && result.data && result.data.length) {
        data = result.data;
      } else {
        error = result.error || null;
      }
    }

    if (document.getElementById('homeNewsTrack')) {
      renderHomeCarousel(data);
    }

    if (document.getElementById('newsPageGrid')) {
      renderNewsGrid(data);
    }

    const filterBar = document.getElementById('newsFilterBar');
    if (filterBar) {
      filterBar.addEventListener('click', (event) => {
        const button = event.target.closest('.news-filter-btn');
        if (!button) return;
        state.filter = button.dataset.filter || 'all';
        renderNewsGrid(data);
      });
    }

    if (error) {
      console.warn('News feed warning:', error);
    }
  }

  renderPublishedPosts().catch(() => {});
})();