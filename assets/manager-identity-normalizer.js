(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AdminIdentityNormalizer = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  function clean(value) {
    return String(value || '').trim().toLowerCase();
  }

  function buildSystemUsers(profiles, aliasRows, excludedUsers = []) {
    const excluded = new Set(excludedUsers.map(clean));
    const usersByEnglishName = new Map();

    (profiles || []).forEach(profile => {
      const en = clean(profile.en_name);
      if (!en || excluded.has(en)) return;
      usersByEnglishName.set(en, {
        en,
        display: profile.display_name || profile.cn_name || profile.en_name || en,
        aliases: new Set([en, clean(profile.cn_name), clean(profile.display_name)].filter(Boolean)),
      });
    });

    (aliasRows || []).forEach(row => {
      const en = clean(row.en_name);
      if (!en || excluded.has(en)) return;
      let user = usersByEnglishName.get(en);
      if (!user) {
        user = { en, display: row.display_name || row.en_name || en, aliases: new Set([en]) };
        usersByEnglishName.set(en, user);
      }
      [row.alias, row.email, row.display_name].map(clean).filter(Boolean).forEach(alias => user.aliases.add(alias));
    });

    return [...usersByEnglishName.values()].map(user => ({
      en: user.en,
      display: user.display,
      aliases: [...user.aliases],
    }));
  }

  function identityTokens(value) {
    const normalized = clean(value);
    if (!normalized) return [];
    return [...new Set([
      normalized,
      ...normalized.split(/[\s()（）<>《》,，;；|｜/\\]+/).filter(Boolean),
    ])];
  }

  function resolveSystemUser(value, users) {
    const tokens = identityTokens(value);
    if (!tokens.length) return null;
    return (users || []).find(user => {
      const aliases = new Set([user.en, user.display, ...(user.aliases || [])].map(clean).filter(Boolean));
      return tokens.some(token => aliases.has(token));
    }) || null;
  }

  return { buildSystemUsers, resolveSystemUser };
});
