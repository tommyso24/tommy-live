(function () {
  'use strict';

  var API_BASE = '/api/comments';
  var MAX_CONTENT_LENGTH = 500;

  // --- Slug extraction ---
  function getSlug() {
    var parts = window.location.pathname.split('/').filter(function (s) { return s.length > 0; });
    return parts[parts.length - 1] || '';
  }

  var slug = getSlug();

  // --- XSS protection ---
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Relative time ---
  function timeAgo(isoStr) {
    var now = Date.now();
    var then = new Date(isoStr).getTime();
    var diffMs = now - then;
    if (isNaN(diffMs) || diffMs < 0) return isoStr;
    var diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return '刚刚';
    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + ' 分钟前';
    var diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return diffHour + ' 小时前';
    var diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return diffDay + ' 天前';
    var d = new Date(isoStr);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // --- Build comment tree ---
  function buildTree(comments) {
    var byId = {};
    var childrenByParent = {};

    comments.forEach(function (c) {
      byId[c.id] = c;
    });

    // Group all non-top-level comments by parent_id
    comments.forEach(function (c) {
      if (c.parent_id !== null && c.parent_id !== undefined) {
        if (!childrenByParent[c.parent_id]) childrenByParent[c.parent_id] = [];
        childrenByParent[c.parent_id].push(c);
      }
    });

    // Find top-level comments
    var topLevel = comments.filter(function (c) {
      return c.parent_id === null || c.parent_id === undefined;
    });

    // For each top-level comment, build replies array (max 2 levels)
    topLevel.forEach(function (top) {
      var replies = [];

      function collectReplies(parentId, depth) {
        var children = childrenByParent[parentId] || [];
        children.forEach(function (child) {
          var reply = Object.assign({}, child);
          if (depth > 1) {
            // Flatten deep replies to level 2, add @mention
            var parent = byId[child.parent_id];
            if (parent) {
              reply._mentionNickname = parent.nickname;
            }
          }
          replies.push(reply);
          collectReplies(child.id, depth + 1);
        });
      }

      collectReplies(top.id, 1);
      top._replies = replies;
    });

    return topLevel;
  }

  // --- Render a single comment ---
  function renderComment(comment, isReply) {
    var mentionHtml = '';
    if (comment._mentionNickname) {
      mentionHtml = '<span class="comment-mention">@' + escapeHtml(comment._mentionNickname) + '</span> ';
    }

    return (
      '<div class="comment-item' + (isReply ? ' comment-reply' : '') + '" data-id="' + escapeHtml(String(comment.id)) + '">' +
        '<div class="comment-header">' +
          '<span class="comment-nickname">🎮 ' + escapeHtml(comment.nickname) + '</span>' +
          '<span class="comment-time">' + timeAgo(comment.created_at) + '</span>' +
        '</div>' +
        '<div class="comment-body">' +
          mentionHtml +
          '<span class="comment-content">' + escapeHtml(comment.content) + '</span>' +
        '</div>' +
        '<div class="comment-actions">' +
          '<button class="comment-reply-btn" data-id="' + escapeHtml(String(comment.id)) + '" data-nickname="' + escapeHtml(comment.nickname) + '">回复</button>' +
        '</div>' +
      '</div>'
    );
  }

  // --- Render full comment list ---
  function renderComments(comments) {
    var titleEl = document.getElementById('commentSectionTitle');
    var listEl = document.getElementById('commentList');
    if (!listEl) return;

    var count = comments.length;
    if (titleEl) {
      titleEl.textContent = '💬 COMMENTS (' + count + ')';
    }

    if (count === 0) {
      listEl.innerHTML = '<div class="comment-empty">还没有评论，来做第一个勇者吧 🎮</div>';
      return;
    }

    var tree = buildTree(comments);
    var html = '';

    tree.forEach(function (top) {
      html += renderComment(top, false);

      if (top._replies && top._replies.length > 0) {
        html += '<div class="comment-replies">';
        top._replies.forEach(function (reply) {
          html += renderComment(reply, true);
        });
        html += '</div>';
      }
    });

    listEl.innerHTML = html;

    // Bind reply button handlers
    var replyBtns = listEl.querySelectorAll('.comment-reply-btn');
    replyBtns.forEach(function (btn) {
      btn.addEventListener('click', handleReplyClick);
    });
  }

  // --- Reply state ---
  var replyToId = null;
  var replyToNickname = null;

  function handleReplyClick(e) {
    var btn = e.currentTarget;
    replyToId = btn.getAttribute('data-id');
    replyToNickname = btn.getAttribute('data-nickname');

    var hintEl = document.getElementById('commentReplyHint');
    if (hintEl) {
      hintEl.innerHTML =
        '回复 <strong>@' + escapeHtml(replyToNickname) + '</strong>' +
        ' <button class="comment-cancel-reply-btn" id="cancelReplyBtn">取消</button>';
      hintEl.style.display = 'block';

      var cancelBtn = document.getElementById('cancelReplyBtn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelReply);
      }
    }

    var textarea = document.getElementById('commentContent');
    if (textarea) {
      textarea.focus();
      var section = document.getElementById('commentSection');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  function cancelReply() {
    replyToId = null;
    replyToNickname = null;
    var hintEl = document.getElementById('commentReplyHint');
    if (hintEl) {
      hintEl.innerHTML = '';
      hintEl.style.display = 'none';
    }
  }

  // --- Load comments ---
  function loadComments() {
    var listEl = document.getElementById('commentList');
    if (!listEl) return;

    listEl.innerHTML = '<div class="comment-loading">加载评论中...</div>';

    fetch(API_BASE + '?slug=' + encodeURIComponent(slug))
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var comments = Array.isArray(data) ? data : (data.comments || []);
        renderComments(comments);
      })
      .catch(function (err) {
        listEl.innerHTML = '<div class="comment-error">评论加载失败，请刷新重试。</div>';
        console.error('Failed to load comments:', err);
      });
  }

  // --- Submit comment ---
  function submitComment() {
    var nicknameEl = document.getElementById('commentNickname');
    var contentEl = document.getElementById('commentContent');
    var messageEl = document.getElementById('commentFormMessage');
    var submitBtn = document.getElementById('commentSubmitBtn');

    var nickname = nicknameEl ? nicknameEl.value.trim() : '';
    var content = contentEl ? contentEl.value.trim() : '';

    if (!nickname) {
      showFormMessage('请填写昵称', 'error');
      if (nicknameEl) nicknameEl.focus();
      return;
    }

    if (!content) {
      showFormMessage('请填写评论内容', 'error');
      if (contentEl) contentEl.focus();
      return;
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      showFormMessage('评论内容不能超过 ' + MAX_CONTENT_LENGTH + ' 个字符', 'error');
      return;
    }

    var payload = {
      slug: slug,
      nickname: nickname,
      content: content
    };

    if (replyToId) {
      payload.parent_id = replyToId;
    }

    if (submitBtn) submitBtn.disabled = true;

    fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (data) {
            throw new Error(data.error || 'HTTP ' + res.status);
          });
        }
        return res.json();
      })
      .then(function () {
        // Save nickname
        try { localStorage.setItem('comment_nickname', nickname); } catch (e) { /* ignore */ }

        // Clear form
        if (contentEl) contentEl.value = '';
        updateCharCount(0);
        cancelReply();

        showFormMessage('评论成功！🎮', 'success');
        loadComments();
      })
      .catch(function (err) {
        showFormMessage('提交失败：' + err.message, 'error');
        console.error('Failed to submit comment:', err);
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  }

  function showFormMessage(msg, type) {
    var el = document.getElementById('commentFormMessage');
    if (!el) return;
    el.textContent = msg;
    el.className = 'comment-form-message comment-form-message--' + type;
    el.style.display = 'block';
    // Auto-hide after 4 seconds
    setTimeout(function () {
      el.style.display = 'none';
    }, 4000);
  }

  function updateCharCount(length) {
    var el = document.getElementById('commentCharCount');
    if (el) el.textContent = length + ' / ' + MAX_CONTENT_LENGTH;
  }

  // --- Init ---
  function init() {
    if (!slug) return;

    // Restore nickname from localStorage
    try {
      var savedNickname = localStorage.getItem('comment_nickname');
      if (savedNickname) {
        var nicknameEl = document.getElementById('commentNickname');
        if (nicknameEl) nicknameEl.value = savedNickname;
      }
    } catch (e) { /* ignore */ }

    // Char count listener
    var contentEl = document.getElementById('commentContent');
    if (contentEl) {
      contentEl.addEventListener('input', function () {
        updateCharCount(contentEl.value.length);
      });
    }

    // Submit button
    var submitBtn = document.getElementById('commentSubmitBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', submitComment);
    }

    // Load comments
    loadComments();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
