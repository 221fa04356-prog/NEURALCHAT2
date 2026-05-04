import React, { useState, useMemo, memo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Smile, Flower2, Coffee, Trophy, Car, Lightbulb, Hash } from 'lucide-react';
import unicodeEmojiData from 'unicode-emoji-json/data-by-emoji.json';

const EMOJI_DATA = [
    {
        category: 'Smileys & People',
        icon: <Smile size={20} />,
        emojis: ['\u{1F600}', '\u{1F601}', '\u{1F602}', '\u{1F923}', '\u{1F603}', '\u{1F604}', '\u{1F605}', '\u{1F606}', '\u{1F609}', '\u{1F60A}', '\u{1F60B}', '\u{1F60E}', '\u{1F60D}', '\u{1F618}', '\u{1F970}', '\u{1F917}', '\u{1F929}', '\u{1F914}', '\u{1F928}', '\u{1F610}', '\u{1F611}', '\u{1F644}', '\u{1F60F}', '\u{1F614}', '\u{1F62A}', '\u{1F634}', '\u{1F972}', '\u{1F62D}', '\u{1F631}', '\u{1F621}', '\u{1F920}', '\u{1F973}', '\u{1F60A}', '\u{1F44D}', '\u{1F44E}', '\u{1F44F}', '\u{1F64F}', '\u{1F91D}', '\u{1F44B}', '\u{1F91F}', '\u{1F48C}', '\u{1F496}', '\u{1F525}', '\u{2728}']
    },
    {
        category: 'Animals & Nature',
        icon: <Flower2 size={20} />,
        emojis: ['\u{1F436}', '\u{1F431}', '\u{1F42D}', '\u{1F439}', '\u{1F430}', '\u{1F98A}', '\u{1F43B}', '\u{1F43C}', '\u{1F428}', '\u{1F42F}', '\u{1F981}', '\u{1F42E}', '\u{1F437}', '\u{1F438}', '\u{1F435}', '\u{1F414}', '\u{1F427}', '\u{1F426}', '\u{1F424}', '\u{1F986}', '\u{1F985}', '\u{1F989}', '\u{1F987}', '\u{1F43A}', '\u{1F434}', '\u{1F984}', '\u{1F41D}', '\u{1F41B}', '\u{1F98B}', '\u{1F40C}', '\u{1F41E}', '\u{1F41C}', '\u{1F422}', '\u{1F40D}', '\u{1F419}', '\u{1F41F}', '\u{1F42C}', '\u{1F433}', '\u{1F98A}', '\u{1F340}', '\u{1F343}', '\u{1F33B}', '\u{1F339}', '\u{1F31F}']
    },
    {
        category: 'Food & Drink',
        icon: <Coffee size={20} />,
        emojis: ['\u{1F34F}', '\u{1F34E}', '\u{1F350}', '\u{1F34A}', '\u{1F34B}', '\u{1F34C}', '\u{1F349}', '\u{1F347}', '\u{1F353}', '\u{1F348}', '\u{1F352}', '\u{1F351}', '\u{1F34D}', '\u{1F95D}', '\u{1F345}', '\u{1F346}', '\u{1F951}', '\u{1F966}', '\u{1F955}', '\u{1F354}', '\u{1F35F}', '\u{1F355}', '\u{1F32E}', '\u{1F32F}', '\u{1F957}', '\u{1F35D}', '\u{1F35C}', '\u{1F35B}', '\u{1F363}', '\u{1F364}', '\u{1F366}', '\u{1F370}', '\u{1F382}', '\u{1F36B}', '\u{1F37F}', '\u{2615}', '\u{1F375}', '\u{1F37A}', '\u{1F377}', '\u{1F379}']
    },
    {
        category: 'Activities',
        icon: <Trophy size={20} />,
        emojis: ['\u{26BD}', '\u{1F3C0}', '\u{1F3C8}', '\u{26BE}', '\u{1F3BE}', '\u{1F3D0}', '\u{1F3C9}', '\u{1F3B1}', '\u{1F3D3}', '\u{1F3F8}', '\u{1F3D2}', '\u{1F3CF}', '\u{26F3}', '\u{1F3F9}', '\u{1F3A3}', '\u{1F94A}', '\u{1F94B}', '\u{1F3C6}', '\u{1F947}', '\u{1F948}', '\u{1F949}', '\u{1F3AE}', '\u{1F3AF}', '\u{1F3B2}', '\u{1F9E9}', '\u{1F3B8}', '\u{1F3B9}', '\u{1F941}', '\u{1F3A4}', '\u{1F3A7}', '\u{1F3AC}']
    },
    {
        category: 'Travel & Places',
        icon: <Car size={20} />,
        emojis: ['\u{1F697}', '\u{1F695}', '\u{1F699}', '\u{1F68C}', '\u{1F68E}', '\u{1F693}', '\u{1F691}', '\u{1F692}', '\u{1F690}', '\u{1F69A}', '\u{1F69B}', '\u{1F6B2}', '\u{1F6F5}', '\u{1F6A8}', '\u{1F68F}', '\u{1F6A6}', '\u{2708}', '\u{1F680}', '\u{26F5}', '\u{1F6A2}', '\u{1F5FA}', '\u{1F5FD}', '\u{26F2}', '\u{1F3D4}', '\u{1F3D6}', '\u{1F3DD}', '\u{1F3E0}', '\u{1F3E2}', '\u{1F3E5}', '\u{1F3E6}', '\u{1F3E8}', '\u{1F307}', '\u{1F303}', '\u{1F309}']
    },
    {
        category: 'Objects',
        icon: <Lightbulb size={20} />,
        emojis: ['\u{231A}', '\u{1F4F1}', '\u{1F4BB}', '\u{2328}', '\u{1F4BD}', '\u{1F4BE}', '\u{1F4BF}', '\u{1F4F7}', '\u{1F4F9}', '\u{1F4DE}', '\u{1F4FA}', '\u{1F4FB}', '\u{23F0}', '\u{1F50B}', '\u{1F50C}', '\u{1F4A1}', '\u{1F526}', '\u{1F511}', '\u{1F512}', '\u{1F513}', '\u{1F527}', '\u{1F528}', '\u{2699}', '\u{1F52A}', '\u{1F48E}', '\u{1F4B0}', '\u{1F381}', '\u{1F388}', '\u{1F4E6}', '\u{1F4DD}', '\u{1F4DA}', '\u{1F4CC}', '\u{1F4CE}', '\u{2702}']
    },
    {
        category: 'Symbols',
        icon: <Hash size={20} />,
        emojis: ['\u{2764}\u{FE0F}', '\u{1F9E1}', '\u{1F49B}', '\u{1F49A}', '\u{1F499}', '\u{1F49C}', '\u{1F5A4}', '\u{1F494}', '\u{1F495}', '\u{1F497}', '\u{1F4AF}', '\u{1F4A2}', '\u{1F4A5}', '\u{1F4AB}', '\u{1F4A6}', '\u{2705}', '\u{274C}', '\u{2B55}', '\u{26A0}', '\u{2757}', '\u{2753}', '\u{1F51E}', '\u{267B}', '\u{1F6AB}', '\u{1F6AD}', '\u{1F6A9}', '\u{1F522}', '\u{1F524}', '\u{1F520}', '\u{1F195}', '\u{1F193}', '\u{1F197}', '\u{1F198}', '\u{1F199}', '\u{1F51C}']
    }
];

const EXTRA_EMOJIS = {
    'Smileys & People': ['😗', '😙', '😚', '☺️', '🙂', '😣', '😥', '😮', '🤐', '😯', '😫', '😌', '😛', '😜', '😝', '🤤', '😒', '😓', '😕', '🙃', '🤑', '😲', '☹️', '🙁', '😖', '😞', '😟', '😤', '😢', '😦', '😧', '😨', '😩', '😰', '🥵', '🥶', '🤪', '😵', '😠', '🤬', '🤡', '🥺', '🤥', '🤓', '😈', '👿', '👹', '👺', '💀', '👻', '👽', '👾', '🤖', '💩', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🙈', '🙉', '🙊', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓', '👴', '👵', '🙍', '🙎', '🙅', '🙆', '💁', '🙋', '🧏', '🙇', '🤦', '🤷', '👮', '🕵️', '💂', '🥷', '👷', '🫅', '🤴', '👸', '👳', '👲', '🧕', '🤵', '👰', '🤰', '🤱', '👼', '🎅', '🤶', '🧑‍🎄', '🦸', '🦹', '🧙', '🧚', '🧛', '🧜', '🧝', '🧞', '🧟', '💆', '💇', '🚶', '🧍', '🧎', '🏃', '💃', '🕺', '🕴️', '👯', '🧖', '🧗', '🤺', '🏇', '⛷️', '🏂', '🏌️', '🏄', '🚣', '🏊', '⛹️', '🏋️', '🚴', '🚵', '🤸', '🤼', '🤽', '🤾', '🤹', '🧘', '🛀', '🛌', '👭', '👫', '👬', '💏', '💑', '👪', '\u{1F607}', '\u{1F60C}', '\u{1F61B}', '\u{1F61C}', '\u{1F61D}', '\u{1F911}', '\u{1F62E}', '\u{1F62F}', '\u{1F632}', '\u{1F635}', '\u{1F92F}', '\u{1F974}', '\u{1F62C}', '\u{1F912}', '\u{1F915}', '\u{1F922}', '\u{1F92E}', '\u{1F927}', '\u{1F637}', '\u{1F92C}', '\u{1F92B}', '\u{1F92D}', '\u{1F9D0}', '\u{1F44C}', '\u{270C}\u{FE0F}', '\u{1F91E}', '\u{1F4AA}', '\u{1F914}', '\u{1F633}', '\u{1F629}', '\u{1F62B}', '\u{1F622}', '\u{1F625}'],
    'Animals & Nature': ['🐽', '🐒', '🐣', '🐥', '🐗', '🦟', '🦗', '🕷', '🕸', '🦂', '🦎', '🦖', '🦕', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦛', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🐐', '🐩', '🐿', '🦔', '🐉', '🐲', '🌵', '🎄', '🌿', '☘️', '🎍', '🎋', '🍂', '🍁', '🍄', '🌾', '💐', '🥀', '🌺', '🌸', '🌼', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌍', '🌎', '🌏', '🪐', '💫', '🌟', '✨', '⚡', '☄️', '💥', '🔥', '🌪️', '🌈', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄', '🌬️', '💨', '💧', '💦', '☔', '☂️', '🌊', '\u{1F98C}', '\u{1F98D}', '\u{1F418}', '\u{1F42A}', '\u{1F42B}', '\u{1F999}', '\u{1F992}', '\u{1F98F}', '\u{1F415}', '\u{1F408}', '\u{1F413}', '\u{1F983}', '\u{1F54A}', '\u{1F407}', '\u{1F400}', '\u{1F43E}', '\u{1F332}', '\u{1F333}', '\u{1F334}', '\u{1F331}', '\u{1F337}', '\u{1F33C}', '\u{1F31E}', '\u{1F319}', '\u{2600}\u{FE0F}', '\u{1F308}', '\u{2B50}'],
    'Food & Drink': ['🥭', '🥥', '🥬', '🥒', '🌶', '🌽', '🥔', '🍠', '🥖', '🥯', '🥓', '🥙', '🥘', '🍱', '🥟', '🍙', '🍘', '🍥', '🥠', '🥮', '🍢', '🍧', '🍨', '🥧', '🍮', '🍭', '🍬', '🍩', '🍪', '🌰', '🥜', '🍯', '🥤', '🍶', '🍻', '🧃', '🧉', '🧊', '🥢', '🍽️', '🍴', '🥄', '🔪', '🏺', '\u{1F35E}', '\u{1F950}', '\u{1F968}', '\u{1F9C0}', '\u{1F95A}', '\u{1F373}', '\u{1F969}', '\u{1F357}', '\u{1F356}', '\u{1F32D}', '\u{1F96A}', '\u{1F35A}', '\u{1F361}', '\u{1F36A}', '\u{1F369}', '\u{1F36D}', '\u{1F36C}', '\u{1F37C}', '\u{1F95B}', '\u{1F942}', '\u{1F943}', '\u{1F37E}'],
    'Activities': ['🥎', '🥅', '⛸', '🎿', '🛷', '🥌', '⛷', '🏂', '🏋️‍♀️', '🏋️‍♂️', '🤼‍♀️', '🤼‍♂️', '🤸‍♀️', '🤸‍♂️', '⛹️‍♀️', '⛹️‍♂️', '🤺', '🤾‍♀️', '🤾‍♂️', '🏌️‍♀️', '🏌️‍♂️', '🏇', '🧘‍♀️', '🧘‍♂️', '🏄‍♀️', '🏄‍♂️', '🏊‍♀️', '🏊‍♂️', '🤽‍♀️', '🤽‍♂️', '🚣‍♀️', '🚣‍♂️', '🧗‍♀️', '🧗‍♂️', '🚵‍♀️', '🚵‍♂️', '🚴‍♀️', '🚴‍♂️', '🏅', '🎖', '🏵', '🎟', '🖼', '🎰', '🎳', '🕹', '🪄', '🪅', '🪩', '🪆', '♟️', '🃏', '🀄', '🎴', '🎺', '🪗', '🪕', '\u{1F3A8}', '\u{1F3AD}', '\u{1F3AA}', '\u{1F3AB}', '\u{1F3B5}', '\u{1F3B6}', '\u{1F3B7}', '\u{1F3BA}', '\u{1F3BB}', '\u{1F3BC}', '\u{1F3A9}', '\u{1F9F8}', '\u{1F3C1}', '\u{1F3BF}', '\u{26F8}\u{FE0F}', '\u{1F3C2}', '\u{1F3CB}\u{FE0F}', '\u{1F9D8}', '\u{1F3CA}', '\u{1F6B4}'],
    'Travel & Places': ['🏎', '🚜', '🏍', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚈', '🚂', '🚆', '🚊', '🚁', '🛩', '🛸', '🛶', '🛥', '🚤', '🛳', '⛴', '⚓️', '🚧', '⛽️', '🚥', '🏁', '🗿', '🗼', '⛱', '🏜', '🌋', '⛰', '🗻', '🏘', '🏚', '🏗', '🏭', '🏬', '🏣', '🏤', '🏪', '🏫', '🏩', '💒', '🏛', '⛪️', '🕌', '🕍', '🕋', '⛩', '🛤', '🛣', '🏙', '🌌', '🌁', '\u{1F68B}', '\u{1F69D}', '\u{1F684}', '\u{1F685}', '\u{1F687}', '\u{1F689}', '\u{1F6EB}', '\u{1F6EC}', '\u{1F6F0}', '\u{1F3F0}', '\u{1F3EF}', '\u{1F3DF}', '\u{1F3A1}', '\u{1F3A2}', '\u{1F3A0}', '\u{26FA}', '\u{1F3D5}', '\u{1F304}', '\u{1F305}', '\u{1F306}'],
    Objects: ['📲', '🖱', '🖲', '📀', '📼', '📸', '🎥', '📽', '🎞', '☎️', '📟', '📠', '🎙', '🎚', '🎛', '⏱', '⏲', '🕰', '⌛️', '⏳', '📡', '🕯', '🗑', '🛢', '💸', '💵', '💴', '💶', '💷', '💳', '⚖️', '⚒', '🛠', '⛏', '🔩', '⛓', '🔫', '🗡', '⚔️', '🚬', '⚰️', '⚱️', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🕳', '🌡', '🧻', '🧽', '🧯', '🚿', '🛁', '🚽', '🛎', '🗝', '🛍', '🎏', '🎀', '🎊', '🎎', '🏮', '🎐', '🧧', '📩', '📨', '🏷', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🗒', '🗓', '📆', '📇', '🗃', '🗳', '🗄', '📋', '📁', '📂', '🗂', '🗞', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📖', '🔖', '🔗', '🖇', '📐', '📏', '📍', '🖊', '🖋', '✒️', '🖌', '🖍', '🔏', '🔐', '\u{1F4A3}', '\u{1F6E1}', '\u{1F9F2}', '\u{1F9EA}', '\u{1F52C}', '\u{1F489}', '\u{1F48A}', '\u{1F9F9}', '\u{1F9FA}', '\u{1F9FC}', '\u{1F6D2}', '\u{1F6AA}', '\u{1F6CB}', '\u{1F6CF}', '\u{1F6CC}', '\u{2709}\u{FE0F}', '\u{1F4E7}', '\u{1F4E5}', '\u{1F4E4}', '\u{1F4C5}', '\u{1F4CA}', '\u{1F4C8}', '\u{1F4C9}', '\u{1F50D}', '\u{1F50E}'],
    Symbols: ['❣️', '💞', '💓', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚️', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🛑', '⛔️', '📛', '♨️', '🚷', '🚯', '🚳', '🚱', '📵', '❕', '❔', '‼️', '⁉️', '🔅', '🔆', '🚸', '🔱', '⚜️', '🔰', '🈯️', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿️', '🅿️', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔡', '🆖', '🆗', '🆙', '🆒', '🔀', '🔁', '🔂', '▶️', '⏩', '⏭️', '⏯️', '◀️', '⏪', '⏮️', '🔼', '⏫', '🔽', '⏬', '⏸️', '⏹️', '⏺️', '⏏️', '🎵', '🎶', '➕', '➖', '➗', '✖️', '🟰', '♾️', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔝', '\u{1F53A}', '\u{1F53B}', '\u{1F53C}', '\u{1F53D}', '\u{1F536}', '\u{1F537}', '\u{1F538}', '\u{1F539}', '\u{1F7E0}', '\u{1F7E1}', '\u{1F7E2}', '\u{1F535}', '\u{1F7E3}', '\u{26AA}', '\u{26AB}', '\u{1F534}', '\u{2648}', '\u{2649}', '\u{264A}', '\u{264B}', '\u{264C}', '\u{264D}', '\u{264E}', '\u{264F}', '\u{2650}', '\u{2651}', '\u{2652}', '\u{2653}']
};

const EMOJI_NAMES = {
    '\u{1F600}': 'Grinning face',
    '\u{1F601}': 'Beaming face',
    '\u{1F602}': 'Face with tears of joy',
    '\u{1F923}': 'Rolling on the floor laughing',
    '\u{1F603}': 'Smiling face with open mouth',
    '\u{1F604}': 'Smiling face with eyes',
    '\u{1F605}': 'Smiling face with sweat',
    '\u{1F606}': 'Grinning squinting face',
    '\u{1F609}': 'Winking face',
    '\u{1F60A}': 'Smiling face',
    '\u{1F60B}': 'Yum face',
    '\u{1F60E}': 'Cool face',
    '\u{1F60D}': 'Heart eyes',
    '\u{1F618}': 'Blowing a kiss',
    '\u{1F970}': 'Smiling face with hearts',
    '\u{1F917}': 'Hugging face',
    '\u{1F929}': 'Star-struck',
    '\u{1F914}': 'Thinking face',
    '\u{1F928}': 'Raised eyebrow',
    '\u{1F610}': 'Neutral face',
    '\u{1F611}': 'Expressionless face',
    '\u{1F644}': 'Eye roll',
    '\u{1F60F}': 'Smirking face',
    '\u{1F614}': 'Pensive face',
    '\u{1F62A}': 'Sleepy face',
    '\u{1F634}': 'Sleeping face',
    '\u{1F972}': 'Holding back tears',
    '\u{1F62D}': 'Loudly crying face',
    '\u{1F631}': 'Screaming face',
    '\u{1F621}': 'Angry face',
    '\u{1F920}': 'Cowboy face',
    '\u{1F973}': 'Partying face',
    '\u{1F607}': 'Smiling face with halo',
    '\u{1F60C}': 'Relieved face',
    '\u{1F61B}': 'Tongue out',
    '\u{1F61C}': 'Winking tongue',
    '\u{1F61D}': 'Squinting tongue',
    '\u{1F911}': 'Money-mouth face',
    '\u{1F62E}': 'Surprised face',
    '\u{1F62F}': 'Hushed face',
    '\u{1F632}': 'Astonished face',
    '\u{1F635}': 'Dizzy face',
    '\u{1F92F}': 'Exploding head',
    '\u{1F974}': 'Woozy face',
    '\u{1F62C}': 'Grimacing face',
    '\u{1F912}': 'Thermometer face',
    '\u{1F915}': 'Bandaged face',
    '\u{1F922}': 'Nauseated face',
    '\u{1F92E}': 'Vomiting face',
    '\u{1F927}': 'Sneezing face',
    '\u{1F637}': 'Medical mask face',
    '\u{1F92C}': 'Cursing face',
    '\u{1F92B}': 'Shushing face',
    '\u{1F92D}': 'Hand over mouth',
    '\u{1F9D0}': 'Monocle face',
    '\u{1F633}': 'Flushed face',
    '\u{1F629}': 'Weary face',
    '\u{1F62B}': 'Tired face',
    '\u{1F622}': 'Crying face',
    '\u{1F625}': 'Sad relieved face',
    '\u{1F44D}': 'Thumbs up',
    '\u{1F44E}': 'Thumbs down',
    '\u{1F44F}': 'Clapping hands',
    '\u{1F64F}': 'Folded hands',
    '\u{1F91D}': 'Handshake',
    '\u{1F44B}': 'Waving hand',
    '\u{1F91F}': 'Love-you gesture',
    '\u{1F44C}': 'OK hand',
    '\u{270C}\u{FE0F}': 'Victory hand',
    '\u{1F91E}': 'Crossed fingers',
    '\u{1F4AA}': 'Flexed biceps',
    '\u{1F4CC}': 'Pushpin',
    '\u{1F4CE}': 'Paperclip',
    '\u{2702}': 'Scissors',
    '\u{1F4C5}': 'Calendar',
    '\u{1F4CA}': 'Bar chart',
    '\u{1F4C8}': 'Chart increasing',
    '\u{1F4C9}': 'Chart decreasing',
    '\u{1F4DD}': 'Memo',
    '\u{1F4DA}': 'Books',
    '\u{1F4E6}': 'Package',
    '\u{1F4E7}': 'Email',
    '\u{1F4E5}': 'Inbox tray',
    '\u{1F4E4}': 'Outbox tray',
    '\u{2709}\u{FE0F}': 'Envelope',
    '\u{1F4DE}': 'Telephone receiver',
    '\u{1F4FA}': 'Television',
    '\u{1F4FB}': 'Radio',
    '\u{1F4F1}': 'Mobile phone',
    '\u{1F4BB}': 'Laptop',
    '\u{2328}': 'Keyboard',
    '\u{1F4BD}': 'Computer disk',
    '\u{1F4BE}': 'Floppy disk',
    '\u{1F4BF}': 'Optical disk',
    '\u{1F4F7}': 'Camera',
    '\u{1F4F9}': 'Video camera',
    '\u{23F0}': 'Alarm clock',
    '\u{231A}': 'Watch',
    '\u{1F50B}': 'Battery',
    '\u{1F50C}': 'Electric plug',
    '\u{1F4A1}': 'Light bulb',
    '\u{1F526}': 'Flashlight',
    '\u{1F511}': 'Key',
    '\u{1F512}': 'Locked',
    '\u{1F513}': 'Unlocked',
    '\u{1F527}': 'Wrench',
    '\u{1F528}': 'Hammer',
    '\u{2699}': 'Gear',
    '\u{1F52A}': 'Kitchen knife',
    '\u{1F48E}': 'Gem stone',
    '\u{1F4B0}': 'Money bag',
    '\u{1F381}': 'Wrapped gift',
    '\u{1F388}': 'Balloon',
    '\u{1F4A3}': 'Bomb',
    '\u{1F6E1}': 'Shield',
    '\u{1F9F2}': 'Magnet',
    '\u{1F9EA}': 'Test tube',
    '\u{1F52C}': 'Microscope',
    '\u{1F489}': 'Syringe',
    '\u{1F48A}': 'Pill',
    '\u{1F9F9}': 'Broom',
    '\u{1F9FA}': 'Basket',
    '\u{1F9FC}': 'Soap',
    '\u{1F6D2}': 'Shopping cart',
    '\u{1F6AA}': 'Door',
    '\u{1F6CB}': 'Couch and lamp',
    '\u{1F6CF}': 'Bed',
    '\u{1F6CC}': 'Person in bed',
    '\u{1F496}': 'Sparkling heart',
    '\u{1F48C}': 'Love letter',
    '\u{2764}\u{FE0F}': 'Red heart',
    '\u{1F9E1}': 'Orange heart',
    '\u{1F49B}': 'Yellow heart',
    '\u{1F49A}': 'Green heart',
    '\u{1F499}': 'Blue heart',
    '\u{1F49C}': 'Purple heart',
    '\u{1F5A4}': 'Black heart',
    '\u{1F494}': 'Broken heart',
    '\u{1F495}': 'Two hearts',
    '\u{1F497}': 'Growing heart',
    '\u{1F525}': 'Fire',
    '\u{2728}': 'Sparkles',
    '\u{1F4AF}': 'Hundred points',
    '\u{1F4A2}': 'Anger symbol',
    '\u{1F4A5}': 'Collision',
    '\u{1F4AB}': 'Dizzy',
    '\u{1F4A6}': 'Sweat droplets',
    '\u{2705}': 'Check mark',
    '\u{274C}': 'Cross mark',
    '\u{2B55}': 'Hollow red circle',
    '\u{26A0}': 'Warning',
    '\u{2757}': 'Exclamation mark',
    '\u{2753}': 'Question mark',
    '\u{1F51E}': 'No one under eighteen',
    '\u{267B}': 'Recycling symbol',
    '\u{1F6AB}': 'Prohibited',
    '\u{1F6AD}': 'No smoking',
    '\u{1F6A9}': 'Triangular flag',
    '\u{1F522}': 'Input numbers',
    '\u{1F524}': 'Input letters',
    '\u{1F520}': 'Input uppercase',
    '\u{1F195}': 'New button',
    '\u{1F193}': 'Free button',
    '\u{1F197}': 'OK button',
    '\u{1F198}': 'SOS button',
    '\u{1F199}': 'Up button',
    '\u{1F51C}': 'Soon arrow',
    '\u{1F53A}': 'Red triangle up',
    '\u{1F53B}': 'Red triangle down',
    '\u{1F53C}': 'Up button triangle',
    '\u{1F53D}': 'Down button triangle',
    '\u{1F536}': 'Large orange diamond',
    '\u{1F537}': 'Large blue diamond',
    '\u{1F538}': 'Small orange diamond',
    '\u{1F539}': 'Small blue diamond',
    '\u{1F7E0}': 'Orange circle',
    '\u{1F7E1}': 'Yellow circle',
    '\u{1F7E2}': 'Green circle',
    '\u{1F535}': 'Blue circle',
    '\u{1F7E3}': 'Purple circle',
    '\u{26AA}': 'White circle',
    '\u{26AB}': 'Black circle',
    '\u{1F534}': 'Red circle',
    '\u{2648}': 'Aries',
    '\u{2649}': 'Taurus',
    '\u{264A}': 'Gemini',
    '\u{264B}': 'Cancer',
    '\u{264C}': 'Leo',
    '\u{264D}': 'Virgo',
    '\u{264E}': 'Libra',
    '\u{264F}': 'Scorpio',
    '\u{2650}': 'Sagittarius',
    '\u{2651}': 'Capricorn',
    '\u{2652}': 'Aquarius',
    '\u{2653}': 'Pisces',
    '\u{1F389}': 'Party popper',
    '\u{1F436}': 'Dog face',
    '\u{1F431}': 'Cat face',
    '\u{1F42D}': 'Mouse face',
    '\u{1F439}': 'Hamster face',
    '\u{1F430}': 'Rabbit face',
    '\u{1F98A}': 'Fox',
    '\u{1F43B}': 'Bear',
    '\u{1F43C}': 'Panda',
    '\u{1F428}': 'Koala',
    '\u{1F42F}': 'Tiger face',
    '\u{1F981}': 'Lion',
    '\u{1F42E}': 'Cow face',
    '\u{1F437}': 'Pig face',
    '\u{1F438}': 'Frog',
    '\u{1F435}': 'Monkey face',
    '\u{1F414}': 'Chicken',
    '\u{1F427}': 'Penguin',
    '\u{1F426}': 'Bird',
    '\u{1F424}': 'Baby chick',
    '\u{1F986}': 'Duck',
    '\u{1F985}': 'Eagle',
    '\u{1F989}': 'Owl',
    '\u{1F987}': 'Bat',
    '\u{1F43A}': 'Wolf',
    '\u{1F434}': 'Horse face',
    '\u{1F984}': 'Unicorn',
    '\u{1F41D}': 'Honeybee',
    '\u{1F41B}': 'Bug',
    '\u{1F98B}': 'Butterfly',
    '\u{1F40C}': 'Snail',
    '\u{1F41E}': 'Lady beetle',
    '\u{1F41C}': 'Ant',
    '\u{1F422}': 'Turtle',
    '\u{1F40D}': 'Snake',
    '\u{1F419}': 'Octopus',
    '\u{1F41F}': 'Fish',
    '\u{1F42C}': 'Dolphin',
    '\u{1F433}': 'Spouting whale',
    '\u{1F340}': 'Four leaf clover',
    '\u{1F343}': 'Leaf fluttering in wind',
    '\u{1F33B}': 'Sunflower',
    '\u{1F339}': 'Rose',
    '\u{1F31F}': 'Glowing star',
    '\u{1F98C}': 'Deer',
    '\u{1F98D}': 'Gorilla',
    '\u{1F418}': 'Elephant',
    '\u{1F42A}': 'Camel',
    '\u{1F42B}': 'Two-hump camel',
    '\u{1F999}': 'Llama',
    '\u{1F992}': 'Giraffe',
    '\u{1F98F}': 'Rhinoceros',
    '\u{1F415}': 'Dog',
    '\u{1F408}': 'Cat',
    '\u{1F413}': 'Rooster',
    '\u{1F983}': 'Turkey',
    '\u{1F54A}': 'Dove',
    '\u{1F407}': 'Rabbit',
    '\u{1F400}': 'Rat',
    '\u{1F43E}': 'Paw prints',
    '\u{1F332}': 'Evergreen tree',
    '\u{1F333}': 'Deciduous tree',
    '\u{1F334}': 'Palm tree',
    '\u{1F331}': 'Seedling',
    '\u{1F337}': 'Tulip',
    '\u{1F33C}': 'Blossom',
    '\u{1F31E}': 'Sun with face',
    '\u{1F319}': 'Crescent moon',
    '\u{2600}\u{FE0F}': 'Sun',
    '\u{1F308}': 'Rainbow',
    '\u{2B50}': 'Star',
    '\u{1F34F}': 'Green apple',
    '\u{1F34E}': 'Red apple',
    '\u{1F350}': 'Pear',
    '\u{1F34A}': 'Tangerine',
    '\u{1F34B}': 'Lemon',
    '\u{1F34C}': 'Banana',
    '\u{1F349}': 'Watermelon',
    '\u{1F347}': 'Grapes',
    '\u{1F353}': 'Strawberry',
    '\u{1F348}': 'Melon',
    '\u{1F352}': 'Cherries',
    '\u{1F351}': 'Peach',
    '\u{1F34D}': 'Pineapple',
    '\u{1F95D}': 'Kiwi fruit',
    '\u{1F345}': 'Tomato',
    '\u{1F346}': 'Eggplant',
    '\u{1F951}': 'Avocado',
    '\u{1F966}': 'Broccoli',
    '\u{1F955}': 'Carrot',
    '\u{1F354}': 'Hamburger',
    '\u{1F35F}': 'French fries',
    '\u{1F355}': 'Pizza',
    '\u{1F32E}': 'Taco',
    '\u{1F32F}': 'Burrito',
    '\u{1F957}': 'Green salad',
    '\u{1F35D}': 'Spaghetti',
    '\u{1F35C}': 'Steaming bowl',
    '\u{1F35B}': 'Curry rice',
    '\u{1F363}': 'Sushi',
    '\u{1F364}': 'Fried shrimp',
    '\u{1F366}': 'Soft ice cream',
    '\u{1F370}': 'Shortcake',
    '\u{1F382}': 'Birthday cake',
    '\u{1F36B}': 'Chocolate bar',
    '\u{1F37F}': 'Popcorn',
    '\u{2615}': 'Hot beverage',
    '\u{1F375}': 'Teacup',
    '\u{1F37A}': 'Beer mug',
    '\u{1F377}': 'Wine glass',
    '\u{1F379}': 'Cocktail glass',
    '\u{1F35E}': 'Bread',
    '\u{1F950}': 'Croissant',
    '\u{1F968}': 'Pretzel',
    '\u{1F9C0}': 'Cheese wedge',
    '\u{1F95A}': 'Egg',
    '\u{1F373}': 'Cooking',
    '\u{1F969}': 'Cut of meat',
    '\u{1F357}': 'Poultry leg',
    '\u{1F356}': 'Meat on bone',
    '\u{1F32D}': 'Hot dog',
    '\u{1F96A}': 'Sandwich',
    '\u{1F35A}': 'Cooked rice',
    '\u{1F361}': 'Dango',
    '\u{1F36A}': 'Cookie',
    '\u{1F369}': 'Doughnut',
    '\u{1F36D}': 'Lollipop',
    '\u{1F36C}': 'Candy',
    '\u{1F37C}': 'Baby bottle',
    '\u{1F95B}': 'Glass of milk',
    '\u{1F942}': 'Clinking glasses',
    '\u{1F943}': 'Tumbler glass',
    '\u{1F37E}': 'Bottle with popping cork',
    '\u{26BD}': 'Soccer ball',
    '\u{1F3C0}': 'Basketball',
    '\u{1F3C8}': 'American football',
    '\u{26BE}': 'Baseball',
    '\u{1F3BE}': 'Tennis',
    '\u{1F3D0}': 'Volleyball',
    '\u{1F3C9}': 'Rugby football',
    '\u{1F3B1}': 'Pool eight ball',
    '\u{1F3D3}': 'Ping pong',
    '\u{1F3F8}': 'Badminton',
    '\u{1F3D2}': 'Ice hockey',
    '\u{1F3CF}': 'Cricket game',
    '\u{26F3}': 'Golf flag',
    '\u{1F3F9}': 'Bow and arrow',
    '\u{1F3A3}': 'Fishing pole',
    '\u{1F94A}': 'Boxing glove',
    '\u{1F94B}': 'Martial arts uniform',
    '\u{1F3C6}': 'Trophy',
    '\u{1F947}': 'Gold medal',
    '\u{1F948}': 'Silver medal',
    '\u{1F949}': 'Bronze medal',
    '\u{1F3AE}': 'Video game',
    '\u{1F3AF}': 'Direct hit',
    '\u{1F3B2}': 'Game die',
    '\u{1F9E9}': 'Puzzle piece',
    '\u{1F3B8}': 'Guitar',
    '\u{1F3B9}': 'Musical keyboard',
    '\u{1F941}': 'Drum',
    '\u{1F3A4}': 'Microphone',
    '\u{1F3A7}': 'Headphone',
    '\u{1F3AC}': 'Clapper board',
    '\u{1F3A8}': 'Artist palette',
    '\u{1F3AD}': 'Performing arts',
    '\u{1F3AA}': 'Circus tent',
    '\u{1F3AB}': 'Ticket',
    '\u{1F3B5}': 'Musical note',
    '\u{1F3B6}': 'Musical notes',
    '\u{1F3B7}': 'Saxophone',
    '\u{1F3BA}': 'Trumpet',
    '\u{1F3BB}': 'Violin',
    '\u{1F3BC}': 'Musical score',
    '\u{1F3A9}': 'Top hat',
    '\u{1F9F8}': 'Teddy bear',
    '\u{1F3C1}': 'Chequered flag',
    '\u{1F3BF}': 'Skis',
    '\u{26F8}\u{FE0F}': 'Ice skate',
    '\u{1F3C2}': 'Snowboarder',
    '\u{1F3CB}\u{FE0F}': 'Weight lifter',
    '\u{1F9D8}': 'Person in lotus position',
    '\u{1F3CA}': 'Swimmer',
    '\u{1F6B4}': 'Cyclist',
    '\u{1F697}': 'Car',
    '\u{1F695}': 'Taxi',
    '\u{1F699}': 'Sport utility vehicle',
    '\u{1F68C}': 'Bus',
    '\u{1F68E}': 'Trolleybus',
    '\u{1F693}': 'Police car',
    '\u{1F691}': 'Ambulance',
    '\u{1F692}': 'Fire engine',
    '\u{1F690}': 'Minibus',
    '\u{1F69A}': 'Delivery truck',
    '\u{1F69B}': 'Articulated lorry',
    '\u{1F6B2}': 'Bicycle',
    '\u{1F6F5}': 'Motor scooter',
    '\u{1F6A8}': 'Police light',
    '\u{1F68F}': 'Bus stop',
    '\u{1F6A6}': 'Traffic light',
    '\u{2708}': 'Airplane',
    '\u{1F680}': 'Rocket',
    '\u{26F5}': 'Sailboat',
    '\u{1F6A2}': 'Ship',
    '\u{1F5FA}': 'World map',
    '\u{1F5FD}': 'Statue of Liberty',
    '\u{26F2}': 'Fountain',
    '\u{1F3D4}': 'Snow-capped mountain',
    '\u{1F3D6}': 'Beach with umbrella',
    '\u{1F3DD}': 'Desert island',
    '\u{1F3E0}': 'House',
    '\u{1F3E2}': 'Office building',
    '\u{1F3E5}': 'Hospital',
    '\u{1F3E6}': 'Bank',
    '\u{1F3E8}': 'Hotel',
    '\u{1F307}': 'Sunset',
    '\u{1F303}': 'Night with stars',
    '\u{1F309}': 'Bridge at night',
    '\u{1F68B}': 'Tram car',
    '\u{1F69D}': 'Monorail',
    '\u{1F684}': 'High-speed train',
    '\u{1F685}': 'Bullet train',
    '\u{1F687}': 'Metro',
    '\u{1F689}': 'Station',
    '\u{1F6EB}': 'Airplane departure',
    '\u{1F6EC}': 'Airplane arrival',
    '\u{1F6F0}': 'Satellite',
    '\u{1F3F0}': 'Castle',
    '\u{1F3EF}': 'Japanese castle',
    '\u{1F3DF}': 'Stadium',
    '\u{1F3A1}': 'Ferris wheel',
    '\u{1F3A2}': 'Roller coaster',
    '\u{1F3A0}': 'Carousel horse',
    '\u{26FA}': 'Tent',
    '\u{1F3D5}': 'Camping',
    '\u{1F304}': 'Sunrise over mountains',
    '\u{1F305}': 'Sunrise',
    '\u{1F306}': 'Cityscape at dusk',
    '\u{1F50D}': 'Magnifying glass tilted left',
    '\u{1F50E}': 'Magnifying glass tilted right'
};

const EMOJI_NAME_OVERRIDES = {
    '😗': 'Kissing face',
    '😙': 'Kissing face with smiling eyes',
    '😚': 'Kissing face with closed eyes',
    '☺️': 'Smiling face',
    '🙂': 'Slightly smiling face',
    '😣': 'Persevering face',
    '🤐': 'Zipper-mouth face',
    '🤤': 'Drooling face',
    '😒': 'Unamused face',
    '😓': 'Downcast face with sweat',
    '😕': 'Confused face',
    '🙃': 'Upside-down face',
    '☹️': 'Frowning face',
    '🙁': 'Slightly frowning face',
    '😖': 'Confounded face',
    '😞': 'Disappointed face',
    '😟': 'Worried face',
    '😤': 'Face with steam from nose',
    '😦': 'Frowning face with open mouth',
    '😧': 'Anguished face',
    '😨': 'Fearful face',
    '😰': 'Anxious face with sweat',
    '🥵': 'Hot face',
    '🥶': 'Cold face',
    '🤪': 'Zany face',
    '😠': 'Angry face',
    '🤡': 'Clown face',
    '🥺': 'Pleading face',
    '🤥': 'Lying face',
    '🤓': 'Nerd face',
    '😈': 'Smiling face with horns',
    '👿': 'Angry face with horns',
    '💀': 'Skull',
    '👻': 'Ghost',
    '👽': 'Alien',
    '🤖': 'Robot',
    '💩': 'Pile of poo',
    '🙈': 'See-no-evil monkey',
    '🙉': 'Hear-no-evil monkey',
    '🙊': 'Speak-no-evil monkey',
    '🤚': 'Raised back of hand',
    '🖐️': 'Hand with fingers splayed',
    '✋': 'Raised hand',
    '🖖': 'Vulcan salute',
    '🤌': 'Pinched fingers',
    '🤏': 'Pinching hand',
    '🤘': 'Sign of the horns',
    '🤙': 'Call me hand',
    '👈': 'Backhand index pointing left',
    '👉': 'Backhand index pointing right',
    '👆': 'Backhand index pointing up',
    '👇': 'Backhand index pointing down',
    '☝️': 'Index pointing up',
    '✊': 'Raised fist',
    '👊': 'Oncoming fist',
    '🤛': 'Left-facing fist',
    '🤜': 'Right-facing fist',
    '🙌': 'Raising hands',
    '👐': 'Open hands',
    '🤲': 'Palms up together',
    '✍️': 'Writing hand',
    '💅': 'Nail polish',
    '🤳': 'Selfie',
    '👀': 'Eyes',
    '👁️': 'Eye',
    '👅': 'Tongue',
    '👄': 'Mouth',
    '👶': 'Baby',
    '👦': 'Boy',
    '👧': 'Girl',
    '👨': 'Man',
    '👩': 'Woman',
    '👴': 'Old man',
    '👵': 'Old woman',
    '💃': 'Woman dancing',
    '🕺': 'Man dancing',
    '🛀': 'Person taking bath',
    '💏': 'Kiss',
    '💑': 'Couple with heart',
    '👪': 'Family',
    '🐽': 'Pig nose',
    '🐒': 'Monkey',
    '🐣': 'Hatching chick',
    '🐥': 'Front-facing baby chick',
    '🐗': 'Boar',
    '🐋': 'Whale',
    '🦈': 'Shark',
    '🐊': 'Crocodile',
    '🌵': 'Cactus',
    '🎄': 'Christmas tree',
    '🌿': 'Herb',
    '☘️': 'Shamrock',
    '🍂': 'Fallen leaf',
    '🍁': 'Maple leaf',
    '🍄': 'Mushroom',
    '🌾': 'Sheaf of rice',
    '💐': 'Bouquet',
    '🥀': 'Wilted flower',
    '🌺': 'Hibiscus',
    '🌸': 'Cherry blossom',
    '🌍': 'Globe showing Europe-Africa',
    '🌎': 'Globe showing Americas',
    '🌏': 'Globe showing Asia-Australia',
    '🪐': 'Ringed planet',
    '⚡': 'High voltage',
    '☄️': 'Comet',
    '❄️': 'Snowflake',
    '🌊': 'Water wave',
    '🥭': 'Mango',
    '🥥': 'Coconut',
    '🥬': 'Leafy green',
    '🥒': 'Cucumber',
    '🌶': 'Hot pepper',
    '🌽': 'Ear of corn',
    '🥔': 'Potato',
    '🍠': 'Roasted sweet potato',
    '🥖': 'Baguette bread',
    '🥯': 'Bagel',
    '🥓': 'Bacon',
    '🥙': 'Stuffed flatbread',
    '🍱': 'Bento box',
    '🥟': 'Dumpling',
    '🥤': 'Cup with straw',
    '🍻': 'Clinking beer mugs',
    '🥢': 'Chopsticks',
    '🍴': 'Fork and knife',
    '🏺': 'Amphora',
    '🎳': 'Bowling',
    '🪄': 'Magic wand',
    '🪩': 'Mirror ball',
    '🃏': 'Joker',
    '🀄': 'Mahjong red dragon',
    '🏎': 'Racing car',
    '🚜': 'Tractor',
    '🏍': 'Motorcycle',
    '🚁': 'Helicopter',
    '🛸': 'Flying saucer',
    '⚓️': 'Anchor',
    '⛽️': 'Fuel pump',
    '🗿': 'Moai',
    '🕌': 'Mosque',
    '🛕': 'Hindu temple',
    '⛪️': 'Church',
    '📲': 'Mobile phone with arrow',
    '☎️': 'Telephone',
    '⌛️': 'Hourglass done',
    '⏳': 'Hourglass not done',
    '💸': 'Money with wings',
    '💳': 'Credit card',
    '⚖️': 'Balance scale',
    '🛠': 'Hammer and wrench',
    '🧿': 'Nazar amulet',
    '🚿': 'Shower',
    '🚽': 'Toilet',
    '🎀': 'Ribbon',
    '🎊': 'Confetti ball',
    '🧧': 'Red envelope',
    '📩': 'Envelope with arrow',
    '📨': 'Incoming envelope',
    '📁': 'File folder',
    '📂': 'Open file folder',
    '🔖': 'Bookmark',
    '🔗': 'Link',
    '📍': 'Round pushpin',
    '❣️': 'Heart exclamation',
    '💞': 'Revolving hearts',
    '💓': 'Beating heart',
    '💘': 'Heart with arrow',
    '💝': 'Heart with ribbon',
    '☮️': 'Peace symbol',
    '✝️': 'Latin cross',
    '☪️': 'Star and crescent',
    '☯️': 'Yin yang',
    '🛑': 'Stop sign',
    '⛔️': 'No entry',
    '📛': 'Name badge',
    '♨️': 'Hot springs',
    '📵': 'No mobile phones',
    '‼️': 'Double exclamation mark',
    '⁉️': 'Exclamation question mark',
    '🔅': 'Dim button',
    '🔆': 'Bright button',
    'ℹ️': 'Information',
    '▶️': 'Play button',
    '◀️': 'Reverse button',
    '⏸️': 'Pause button',
    '⏹️': 'Stop button',
    '➕': 'Plus',
    '➖': 'Minus',
    '➗': 'Divide',
    '✖️': 'Multiply',
    '™️': 'Trade mark',
    '©️': 'Copyright',
    '®️': 'Registered'
};

const formatEmojiName = (name) => name.charAt(0).toUpperCase() + name.slice(1);

const getUnicodeEmojiName = (emoji) => {
    const entry = unicodeEmojiData[emoji] || unicodeEmojiData[emoji.replace(/\uFE0F/g, '')] || unicodeEmojiData[`${emoji}\uFE0F`];
    return entry?.name ? formatEmojiName(entry.name) : null;
};

const getEmojiName = (emoji) => EMOJI_NAMES[emoji] || EMOJI_NAME_OVERRIDES[emoji] || getUnicodeEmojiName(emoji) || 'Emoji symbol';

const getCategoryEmojis = (category) => {
    const base = category.emojis;
    const extra = EXTRA_EMOJIS[category.category] || [];
    return Array.from(new Set([...base, ...extra]));
};

const EmojiPicker = ({ onSelect, onClose, position, className = "", zoom = 1 }) => {
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState(EMOJI_DATA[0].category);
    const [tooltip, setTooltip] = useState(null);
    const pickerRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        const handleClickOutside = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    const filteredData = useMemo(() => {
        if (!search) return EMOJI_DATA;
        const all = EMOJI_DATA.flatMap((category) => getCategoryEmojis(category));
        return [{ category: 'Search', icon: <Smile size={20} />, emojis: all.slice(0, 80) }];
    }, [search]);

    const effViewportWidth = window.innerWidth / zoom;
    const effViewportHeight = window.innerHeight / zoom;
    const padding = 20;
    const pickerWidth = Math.min(360, effViewportWidth - padding * 2);
    const pickerHeight = Math.min(480, effViewportHeight - 120);
    const posX = position.x / zoom;
    const posY = position.y / zoom;
    const left = Math.min(Math.max(padding + pickerWidth / 2, posX), effViewportWidth - padding - pickerWidth / 2);

    let top;
    let transform;
    let marginTop = 0;
    if (posY + 20 + pickerHeight <= effViewportHeight - padding) {
        top = posY + 20;
        transform = 'translate(-50%, 0)';
        marginTop = 10;
    } else if (posY - 20 - pickerHeight >= padding) {
        top = posY - 20;
        transform = 'translate(-50%, -100%)';
        marginTop = -10;
    } else {
        top = Math.max(padding, effViewportHeight - pickerHeight - padding);
        transform = 'translate(-50%, 0)';
    }

    const scrollToCategory = (category) => {
        setActiveCategory(category);
        const scroller = listRef.current;
        const el = document.getElementById(`cat-${category}`);
        if (scroller && el) {
            scroller.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
        }
    };

    const handleScroll = () => {
        setTooltip(null);
        const scroller = listRef.current;
        if (!scroller || search) return;
        const topEdge = scroller.scrollTop + 28;
        let current = EMOJI_DATA[0].category;
        for (const category of EMOJI_DATA) {
            const el = document.getElementById(`cat-${category.category}`);
            if (el && el.offsetTop <= topEdge) current = category.category;
        }
        setActiveCategory(current);
    };

    const showEmojiTooltip = (event, label) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setTooltip({
            label,
            x: Math.min(Math.max(rect.left + rect.width / 2, 96), window.innerWidth - 96),
            y: Math.max(rect.top - 8, 12)
        });
    };

    return (
        <div
            ref={pickerRef}
            className={`wa-full-emoji-picker ${className}`}
            style={{ position: 'fixed', top, left, width: pickerWidth, height: pickerHeight, zIndex: 10005, transform, marginTop }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="wa-emoji-picker-container">
                <div className="wa-emoji-picker-header">
                    <div className="wa-emoji-categories">
                        {EMOJI_DATA.map((cat) => (
                            <button
                                type="button"
                                key={cat.category}
                                className={`wa-emoji-cat-btn ${activeCategory === cat.category ? 'active' : ''}`}
                                aria-label={cat.category}
                                onClick={() => scrollToCategory(cat.category)}
                            >
                                {cat.icon}
                                {activeCategory === cat.category && <span className="wa-cat-indicator" />}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="wa-emoji-list-scroll" ref={listRef} onScroll={handleScroll}>
                    {filteredData.map((cat) => (
                        <div key={cat.category} id={`cat-${cat.category}`} className="wa-emoji-section">
                            <div className="wa-emoji-section-title">{cat.category}</div>
                            <div className="wa-emoji-grid">
                                {getCategoryEmojis(cat).map((emoji, i) => {
                                    const emojiName = getEmojiName(emoji, cat.category);
                                    return (
                                    <button
                                        key={`${emoji}-${i}`}
                                        type="button"
                                        className="wa-emoji-item has-emoji-name"
                                        aria-label={emojiName}
                                        data-emoji-name={emojiName}
                                        onMouseEnter={(event) => showEmojiTooltip(event, emojiName)}
                                        onMouseLeave={() => setTooltip(null)}
                                        onFocus={(event) => showEmojiTooltip(event, emojiName)}
                                        onBlur={() => setTooltip(null)}
                                        onClick={() => onSelect(emoji)}
                                    >
                                        {emoji}
                                    </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {tooltip && createPortal(
                <div
                    className="wa-emoji-floating-tooltip"
                    style={{ left: tooltip.x, top: tooltip.y }}
                    role="tooltip"
                >
                    {tooltip.label}
                </div>,
                document.body
            )}
            <div className="wa-emoji-picker-backdrop" onClick={onClose} />
        </div>
    );
};

export default memo(EmojiPicker);
