// YouTube Player API
let player;
let isPlayerReady = false;
let qualitySetForCurrentVideo = false;

// WebSocket connection
const socket = io();

// History management
let videoHistory = [];
const MAX_HISTORY = 50;

// DOM elements
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const currentUrlElement = document.getElementById('currentUrl');
const placeholder = document.getElementById('placeholder');
const playerElement = document.getElementById('player');
const testUrl = document.getElementById('testUrl');
const testButton = document.getElementById('testButton');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistory');
const pauseBtn = document.getElementById('pauseBtn');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const videoContainer = document.querySelector('.video-container');

// Load YouTube IFrame API
function loadYouTubeAPI() {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

// Called automatically when YouTube API is ready
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 1,
            controls: 1,
            modestbranding: 1,
            rel: 0
        },
        events: {
            onReady: onPlayerReady,
            onError: onPlayerError,
            onStateChange: onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    isPlayerReady = true;
    console.log('YouTube player is ready');
}

function onPlayerStateChange(event) {
    // Set quality only once when video starts playing
    if (event.data === YT.PlayerState.PLAYING && !qualitySetForCurrentVideo) {
        try {
            // Validate player is ready
            if (!player || !isPlayerReady) {
                console.warn('Player not ready for quality adjustment');
                return;
            }

            const availableQualityLevels = player.getAvailableQualityLevels();

            if (!availableQualityLevels || availableQualityLevels.length === 0) {
                console.warn('No quality levels available for this video');
                qualitySetForCurrentVideo = true;
                return;
            }

            // Define quality priority (highest to lowest)
            const qualityPreference = [
                'highres',  // 4K/8K
                'hd2160',   // 4K
                'hd1440',   // 1440p
                'hd1080',   // 1080p
                'hd720',    // 720p
                'large',    // 480p
                'medium',   // 360p
                'small'     // 240p
            ];

            // Find highest available quality from our preference list
            let selectedQuality = availableQualityLevels[0]; // Fallback to first
            for (const quality of qualityPreference) {
                if (availableQualityLevels.includes(quality)) {
                    selectedQuality = quality;
                    break;
                }
            }

            player.setPlaybackQuality(selectedQuality);
            console.log('Set video quality to:', selectedQuality);
            qualitySetForCurrentVideo = true;

            // Update title in current video display after quality is set
            setTimeout(() => {
                const title = getVideoTitle();
                if (title && currentUrlElement) {
                    currentUrlElement.setAttribute('data-url', currentUrlElement.textContent);
                    currentUrlElement.textContent = title;
                }
            }, 500);

        } catch (e) {
            console.warn('Could not set quality:', e);
            qualitySetForCurrentVideo = true; // Don't retry on error
        }
    } else if (event.data === YT.PlayerState.CUED || event.data === YT.PlayerState.UNSTARTED) {
        // Reset flag when a new video is loaded
        qualitySetForCurrentVideo = false;
    }
}

function onPlayerError(event) {
    console.error('YouTube player error:', event.data);
    alert('Error loading video. Please check the URL.');
}

// Extract YouTube video ID from URL
function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return null;
}

// Validate YouTube URL for security
function isValidYouTubeUrl(url) {
    if (typeof url !== 'string' || url.length > 500) {
        return false;
    }

    // Only allow YouTube URLs or valid video IDs
    const validPatterns = [
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}(&.*)?$/,
        /^https?:\/\/youtu\.be\/[a-zA-Z0-9_-]{11}$/,
        /^https?:\/\/(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]{11}$/,
        /^[a-zA-Z0-9_-]{11}$/ // Direct video ID
    ];

    return validPatterns.some(pattern => pattern.test(url));
}

// Validate history item structure
function validateHistoryItem(item) {
    if (!item || typeof item !== 'object') return false;
    if (!isValidYouTubeUrl(item.url)) return false;
    if (typeof item.timestamp !== 'string' || item.timestamp.length > 100) return false;
    if (item.videoId && typeof item.videoId !== 'string') return false;
    return true;
}

// Get video title from player
function getVideoTitle() {
    try {
        if (player && isPlayerReady) {
            const videoData = player.getVideoData();
            return videoData && videoData.title ? videoData.title : null;
        }
    } catch (e) {
        console.warn('Could not get video title:', e);
    }
    return null;
}

// Add video to history
function addToHistory(url, title = null) {
    // Validate URL before adding
    if (!isValidYouTubeUrl(url)) {
        console.warn('Invalid URL rejected from history:', url);
        return;
    }

    const videoId = extractVideoId(url);
    const timestamp = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    // Use provided title or try to get it from player
    const videoTitle = title || getVideoTitle() || 'YouTube Video';

    // Check if URL already exists in history
    const existingIndex = videoHistory.findIndex(item => item.url === url);

    if (existingIndex !== -1) {
        // Remove existing entry
        videoHistory.splice(existingIndex, 1);
    }

    // Add to beginning of history
    videoHistory.unshift({
        url,
        videoId,
        title: videoTitle,
        timestamp
    });

    // Limit history size
    if (videoHistory.length > MAX_HISTORY) {
        videoHistory = videoHistory.slice(0, MAX_HISTORY);
    }

    // Save to localStorage
    saveHistory();

    // Update UI
    renderHistory();
}

// Save history to localStorage with quota management
function saveHistory() {
    try {
        const historyJson = JSON.stringify(videoHistory);

        // Check size (localStorage limit is typically 5-10MB)
        const sizeInBytes = new Blob([historyJson]).size;
        const maxSizeBytes = 500000; // 500KB limit for safety

        if (sizeInBytes > maxSizeBytes) {
            console.warn('History too large, trimming...');
            // Remove oldest entries until under limit
            while (videoHistory.length > 0 &&
                   new Blob([JSON.stringify(videoHistory)]).size > maxSizeBytes) {
                videoHistory.pop();
            }
        }

        localStorage.setItem('videoHistory', JSON.stringify(videoHistory));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.error('localStorage quota exceeded, clearing old history');
            // Keep only 10 most recent entries
            videoHistory = videoHistory.slice(0, 10);
            try {
                localStorage.setItem('videoHistory', JSON.stringify(videoHistory));
            } catch (e2) {
                console.error('Failed to save even trimmed history');
                localStorage.removeItem('videoHistory');
            }
        } else {
            console.error('Failed to save history:', e);
        }
    }
}

// Load history from localStorage with validation
function loadHistory() {
    try {
        const saved = localStorage.getItem('videoHistory');
        if (saved) {
            const parsed = JSON.parse(saved);

            // Validate it's an array
            if (!Array.isArray(parsed)) {
                console.warn('Invalid history format - resetting');
                localStorage.removeItem('videoHistory');
                return;
            }

            // Filter and validate each item
            videoHistory = parsed
                .filter(validateHistoryItem)
                .slice(0, MAX_HISTORY); // Enforce max length

            // If we filtered out items, update localStorage
            if (videoHistory.length !== parsed.length) {
                console.warn(`Removed ${parsed.length - videoHistory.length} invalid history items`);
                saveHistory();
            }

            renderHistory();
        }
    } catch (e) {
        console.error('Failed to load history:', e);
        // Clear corrupted data
        localStorage.removeItem('videoHistory');
        videoHistory = [];
    }
}

// Clear history
function clearHistory() {
    if (confirm('Are you sure you want to clear all history?')) {
        videoHistory = [];
        saveHistory();
        renderHistory();
    }
}

// Render history list
function renderHistory() {
    if (!historyList) return;

    if (videoHistory.length === 0) {
        historyList.innerHTML = '<p class="no-history">No videos played yet</p>';
        return;
    }

    // Clear existing content
    historyList.innerHTML = '';

    videoHistory.forEach((item) => {
        // Create elements programmatically to prevent XSS
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';

        const historyInfo = document.createElement('div');
        historyInfo.className = 'history-info';

        const titleRow = document.createElement('div');
        titleRow.className = 'history-title-row';

        const historyTitle = document.createElement('div');
        historyTitle.className = 'history-title';
        historyTitle.textContent = item.title || item.url; // Safe - no HTML parsing
        historyTitle.title = item.url;

        // Add link icon to view URL
        const urlIcon = document.createElement('button');
        urlIcon.className = 'url-icon';
        urlIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';
        urlIcon.title = item.url;
        urlIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            // Copy URL to clipboard
            navigator.clipboard.writeText(item.url).then(() => {
                const originalTitle = urlIcon.title;
                urlIcon.title = 'Copied!';
                setTimeout(() => {
                    urlIcon.title = originalTitle;
                }, 2000);
            }).catch(() => {
                alert(item.url);
            });
        });

        titleRow.appendChild(historyTitle);
        titleRow.appendChild(urlIcon);

        const historyTime = document.createElement('div');
        historyTime.className = 'history-time';
        historyTime.textContent = item.timestamp;

        historyInfo.appendChild(titleRow);
        historyInfo.appendChild(historyTime);

        const replayBtn = document.createElement('button');
        replayBtn.className = 'replay-btn';
        replayBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Play
        `;
        // Use addEventListener instead of onclick attribute to prevent injection
        replayBtn.addEventListener('click', () => replayVideo(item.url));

        historyItem.appendChild(historyInfo);
        historyItem.appendChild(replayBtn);
        historyList.appendChild(historyItem);
    });
}

// Replay video from history
function replayVideo(url) {
    playVideo(url);
}

// Play video
function playVideo(url, addToHistoryFlag = true) {
    const videoId = extractVideoId(url);

    if (!videoId) {
        console.error('Invalid YouTube URL:', url);
        alert('Invalid YouTube URL');
        return;
    }

    if (!isPlayerReady) {
        console.log('Player not ready yet, waiting...');
        setTimeout(() => playVideo(url, addToHistoryFlag), 500);
        return;
    }

    // Hide placeholder to show player underneath
    placeholder.classList.add('hidden');

    // Load and play video (quality will be set by onPlayerStateChange handler)
    player.loadVideoById(videoId);

    // Update current URL display
    currentUrlElement.textContent = url;
    currentUrlElement.setAttribute('data-url', url);

    // Show URL icon
    const currentUrlIcon = document.getElementById('currentUrlIcon');
    if (currentUrlIcon) {
        currentUrlIcon.style.display = 'inline-flex';
    }

    // Add to history
    if (addToHistoryFlag) {
        addToHistory(url);
    }

    console.log('Playing video:', videoId);
}

// WebSocket event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    statusIndicator.classList.add('connected');
    statusText.textContent = 'Connected';
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    statusIndicator.classList.remove('connected');
    statusText.textContent = 'Disconnected';
});

socket.on('play-video', (data) => {
    console.log('Received play-video event:', data);
    playVideo(data.url);
});

// Control event handlers from API
socket.on('control-pause', () => {
    console.log('Received pause command from API');
    if (player && isPlayerReady) {
        player.pauseVideo();
    }
});

socket.on('control-resume', () => {
    console.log('Received resume command from API');
    if (player && isPlayerReady) {
        player.playVideo();
    }
});

socket.on('control-stop', () => {
    console.log('Received stop command from API');
    if (player && isPlayerReady) {
        player.stopVideo();
        placeholder.classList.remove('hidden');
        currentUrlElement.textContent = 'No video loaded';
    }
});

socket.on('control-fullscreen', () => {
    console.log('Received fullscreen command from API');
    if (!videoContainer) return;

    if (!document.fullscreenElement) {
        if (videoContainer.requestFullscreen) {
            videoContainer.requestFullscreen();
        } else if (videoContainer.webkitRequestFullscreen) {
            videoContainer.webkitRequestFullscreen();
        } else if (videoContainer.msRequestFullscreen) {
            videoContainer.msRequestFullscreen();
        }
    }
});

socket.on('control-exitfullscreen', () => {
    console.log('Received exit fullscreen command from API');

    if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
});

// Test form handler
testButton.addEventListener('click', async () => {
    const url = testUrl.value.trim();

    if (!url) {
        alert('Please enter a YouTube URL');
        return;
    }

    // Validate URL before sending
    if (!isValidYouTubeUrl(url)) {
        alert('Please enter a valid YouTube URL');
        return;
    }

    try {
        const response = await fetch('/api/play', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });

        const result = await response.json();

        if (result.success) {
            console.log('Video URL sent successfully');
            testUrl.value = '';
        } else {
            alert('Error: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error sending video URL:', error);
        alert('Failed to send video URL. Please try again.');
    }
});

// Allow Enter key to submit
testUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        testButton.click();
    }
});

// Fullscreen functionality
function toggleFullscreen() {
    if (!videoContainer) return;

    if (!document.fullscreenElement) {
        // Enter fullscreen
        if (videoContainer.requestFullscreen) {
            videoContainer.requestFullscreen();
        } else if (videoContainer.webkitRequestFullscreen) {
            videoContainer.webkitRequestFullscreen();
        } else if (videoContainer.msRequestFullscreen) {
            videoContainer.msRequestFullscreen();
        }
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}

// Update fullscreen button text when fullscreen state changes
function updateFullscreenButton() {
    if (!fullscreenBtn) return;

    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;

    if (isFullscreen) {
        fullscreenBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
            </svg>
            Exit Fullscreen
        `;
    } else {
        fullscreenBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
            Fullscreen
        `;
    }
}

// Listen for fullscreen changes (including ESC key)
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
document.addEventListener('msfullscreenchange', updateFullscreenButton);

// Video control buttons
if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
        if (player && isPlayerReady) {
            player.pauseVideo();
            console.log('Video paused');
        }
    });
}

if (playBtn) {
    playBtn.addEventListener('click', () => {
        if (player && isPlayerReady) {
            player.playVideo();
            console.log('Video resumed');
        }
    });
}

if (stopBtn) {
    stopBtn.addEventListener('click', () => {
        if (player && isPlayerReady) {
            player.stopVideo();
            placeholder.classList.remove('hidden');
            currentUrlElement.textContent = 'No video loaded';
            console.log('Video stopped');
        }
    });
}

if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleFullscreen);
}

// Clear history button
if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearHistory);
}

// Current URL icon button
const currentUrlIcon = document.getElementById('currentUrlIcon');
if (currentUrlIcon) {
    currentUrlIcon.addEventListener('click', () => {
        const url = currentUrlElement.getAttribute('data-url') || currentUrlElement.textContent;
        if (url && url !== 'No video loaded') {
            navigator.clipboard.writeText(url).then(() => {
                const originalTitle = currentUrlIcon.title;
                currentUrlIcon.title = 'Copied!';
                setTimeout(() => {
                    currentUrlIcon.title = originalTitle;
                }, 2000);
            }).catch(() => {
                alert(url);
            });
        }
    });
}

// Toggle panel visibility
function setupToggleButtons() {
    const toggleCurrentVideo = document.getElementById('toggleCurrentVideo');
    const toggleHistory = document.getElementById('toggleHistory');
    const currentVideoContent = document.getElementById('currentVideoContent');
    const historyList = document.getElementById('historyList');

    if (!toggleCurrentVideo || !toggleHistory) return;

    // Load saved states from localStorage
    const currentVideoCollapsed = localStorage.getItem('currentVideoCollapsed') === 'true';
    const historyCollapsed = localStorage.getItem('historyCollapsed') === 'true';

    if (currentVideoCollapsed) {
        currentVideoContent.classList.add('collapsed');
        toggleCurrentVideo.classList.add('collapsed');
    }

    if (historyCollapsed) {
        historyList.classList.add('collapsed');
        toggleHistory.classList.add('collapsed');
    }

    // Toggle current video section
    toggleCurrentVideo.addEventListener('click', () => {
        currentVideoContent.classList.toggle('collapsed');
        toggleCurrentVideo.classList.toggle('collapsed');
        localStorage.setItem('currentVideoCollapsed', currentVideoContent.classList.contains('collapsed'));
    });

    // Toggle history section
    toggleHistory.addEventListener('click', () => {
        historyList.classList.toggle('collapsed');
        toggleHistory.classList.toggle('collapsed');
        localStorage.setItem('historyCollapsed', historyList.classList.contains('collapsed'));
    });
}

// Toast notification system
function showToast(title, message, type = 'success', duration = 5000) {
    const toastContainer = document.getElementById('toastContainer');

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Choose icon based on type
    let icon = '';
    if (type === 'success') {
        icon = '✓';
    } else if (type === 'error') {
        icon = '✕';
    } else if (type === 'warning') {
        icon = '⚠';
    } else {
        icon = 'ℹ';
    }

    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close">×</button>
    `;

    toastContainer.appendChild(toast);

    // Close button functionality
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        removeToast(toast);
    });

    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => {
            removeToast(toast);
        }, duration);
    }
}

function removeToast(toast) {
    toast.classList.add('hiding');
    setTimeout(() => {
        toast.remove();
    }, 300); // Match animation duration
}

// Listen for authentication events
socket.on('auth-attempt', (data) => {
    if (data.success) {
        showToast(
            'Device Connected',
            `${data.deviceName} authenticated successfully`,
            'success'
        );
    } else {
        showToast(
            'Authentication Failed',
            `${data.reason} from ${data.ip}`,
            'error'
        );
    }
});

// Initialize
loadYouTubeAPI();
loadHistory();
setupToggleButtons();
