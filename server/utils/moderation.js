const normalizeModerationText = (value = '') => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[@]/g, 'a')
    .replace(/[!1|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[3]/g, 'e')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+/gi;

const stripUrlsForModeration = (value = '') => String(value || '')
    .replace(urlPattern, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isUrlOnlyContent = (value = '') => {
    const original = String(value || '').trim();
    return !!original && !stripUrlsForModeration(original);
};

const badWordPatterns = [
    /\bfuck(?:er|ing|ed)?\b/i,
    /\bmother\s*fucker\b/i,
    /\bshit(?:ty)?\b/i,
    /\bass(?:hole)?\b/i,
    /\barse\b/i,
    /\bbitch(?:es)?\b/i,
    /\bson\s+of\s+a\s+bitch\b/i,
    /\bbastard\b/i,
    /\bcunt\b/i,
    /\bdick\s*head\b/i,
    /\bwanker\b/i,
    /\bbollocks\b/i,
    /\bpiss\s+off\b/i,
    /\bbloody\s+hell\b/i,
    /\btwat\b/i,
    /\bprick\b/i,
    /\bdouche\s*bag\b/i,
    /\bdamn(?:it)?\b/i,
    /\bidiot\b/i,
    /\bstupid\b/i,
    /\bslut\b/i,
    /\bwhore\b/i,
    /\bcrap\b/i,
    /\bjerk\b/i,
    /\bmierda\b/i,
    /\bputa\b/i,
    /\bcabron\b/i,
    /\bcono\b/i,
    /\bjoder\b/i,
    /\bhijo\s+de\s+puta\b/i,
    /\bme\s+cago\s+en\s+la\s+leche\b/i,
    /\bcome\s+mierda\b/i,
    /\bpendejo\b/i,
    /\bgilipollas\b/i,
    /\bconcha\b/i,
    /\bchaqueta\b/i,
    /\bmerde\b/i,
    /\bputain\b/i,
    /\bsalope\b/i,
    /\bconnard\b/i,
    /\bcon\b/i,
    /\bnique\s+ta\s+mere\b/i,
    /\bva\s+te\s+faire\s+foutre\b/i,
    /\bta\s+gueule\b/i,
    /\bcul\b/i,
    /\bfils\s+de\s+salope\b/i,
    /\btabarnak\b/i,
    /\bchutiya\b/i,
    /\bmadar\s*chod\b/i,
    /\bbehen\s*chod\b/i,
    /\bbhosadi?ke\b/i,
    /\bbsdk\b/i,
    /\bgandu\b/i,
    /\brandi\b/i,
    /\bkutt[ai]\b/i,
    /\bharamzada\b/i,
    /\bbadkho\b/i,
    /\blanja\s+kodaka\b/i,
    /\bdengu\b/i,
    /\bdengey\b/i,
    /\byerri\s*pooku\b/i,
    /\bmodda\b/i,
    /\bmadda\b/i,
    /\bpooku\b/i,
    /\bgudda\b/i,
    /\bkojja\b/i,
    /\bmunda\b/i,
    /\botha\b/i,
    /\bthayoli\b/i,
    /\bthevidiya\b/i,
    /\bpundai\b/i,
    /\bsunni\b/i,
    /\bpoolu\b/i,
    /\bsoothu\b/i,
    /\bkundi\b/i,
    /\bbaadu\b/i,
    /\bloose?u\b/i,
    /\bzavadya\b/i,
    /\bbulla\b/i,
    /\bkothi\b/i,
    /\bkathhe\b/i,
    /\bsule\s+magane\b/i,
    /\bkhanki\b/i,
    /\bbara\b/i,
    /\bchoda\b/i,
    /\bpatti\b/i,
    /\bpunda\b/i,
    /\b(?:kill|murder|die|abuse|hurt|harm|hate)\b/i,
    /\b(?:kill|hurt|harm)\s+(?:you|u|him|her|them|me)\b/i
];

const compactBadFragments = [
    'fuck', 'motherfucker', 'shit', 'asshole', 'arse', 'bitch', 'sonofabitch', 'bastard', 'cunt',
    'dickhead', 'wanker', 'bollocks', 'pissoff', 'bloodyhell', 'twat', 'prick', 'douchebag',
    'damn', 'dammit', 'idiot', 'stupid', 'slut', 'whore', 'crap',
    'mierda', 'puta', 'cabron', 'cono', 'joder', 'hijodeputa', 'mecagoenlaleche',
    'comemierda', 'pendejo', 'gilipollas', 'concha', 'chaqueta',
    'merde', 'putain', 'salope', 'connard', 'niquetamere', 'vatefairefoutre', 'tagueule',
    'filsdesalope', 'tabarnak',
    'chutiya', 'madarchod', 'behenchod', 'bhosadike', 'bhosdike', 'bsdk',
    'gandu', 'randi', 'kutta', 'kutti', 'haramzada', 'badkho',
    'lanjakodaka', 'dengu', 'dengey', 'yerripooku', 'madda', 'modda', 'pooku', 'gudda', 'kojja', 'munda',
    'otha', 'thayoli', 'thevidiya', 'pundai', 'sunni', 'poolu', 'soothu', 'kundi', 'baadu', 'loosu',
    'zavadya', 'bulla', 'kothi', 'kathhe', 'sulemagane', 'khanki', 'bara', 'choda', 'patti', 'punda'
];

const detectUnsafeText = (value = '') => {
    const original = String(value || '').trim();
    if (!original) return { isUnsafe: false };
    const normalized = normalizeModerationText(original);
    const compact = normalized.replace(/\s+/g, '');
    const isBadWord = badWordPatterns.some((pattern) => pattern.test(original) || pattern.test(normalized)) ||
        compactBadFragments.some((fragment) => compact.includes(fragment));
    if (isBadWord) {
        return { isUnsafe: true, reason: 'Profanity/Harassment: Bad meaning words detected.', type: 'direct' };
    }

    const lettersOnly = normalized.replace(/[^a-z]/g, '');
    const words = normalized.split(/\s+/).filter(Boolean);
    const uniqueLetters = new Set(lettersOnly).size;
    const consonantRuns = lettersOnly.match(/[^aeiouy]{4,}/gi) || [];
    const alphabetRuns = ['abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba', 'qwertyuiop', 'poiuytrewq', 'asdfghjkl', 'lkjhgfdsa', 'zxcvbnm', 'mnbvcxz'];
    const isNonsense = lettersOnly.length >= 3 && (
        /(.)\1{3,}/i.test(lettersOnly) ||
        /([a-z]{2,3})\1{1,}/i.test(lettersOnly) ||
        (lettersOnly.length >= 5 && uniqueLetters <= 3) ||
        (lettersOnly.length >= 5 && consonantRuns.some((run) => run.length >= 4) && !/(th|sh|ch|ph|wh|ck)/i.test(lettersOnly)) ||
        alphabetRuns.some((run) => run.includes(lettersOnly)) ||
        (words.length >= 3 && words.every((word) => word === words[0]))
    );
    if (isNonsense) {
        return { isUnsafe: true, reason: 'Meaningless/Repetitive: Message appears to be random or spam text.', type: 'indirect' };
    }
    return { isUnsafe: false };
};

module.exports = {
    detectUnsafeText,
    stripUrlsForModeration,
    isUrlOnlyContent,
    normalizeModerationText,
    compactBadFragments
};
