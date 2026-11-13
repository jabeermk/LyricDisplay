// Public-domain sample songs with deterministic IDs. Verify the Malayalam text before performing.
const T = 1700000000000

const RAW = [
  {
    id: 'sample-amazing-grace',
    title: 'Amazing Grace',
    language: 'English',
    tag: 'Melody',
    pitch: 'G, slow 3/4',
    lyrics: `Amazing grace! How sweet the sound
That saved a wretch like me!
I once was lost, but now am found;
Was blind, but now I see.

'Twas grace that taught my heart to fear,
And grace my fears relieved;
How precious did that grace appear
The hour I first believed.

Through many dangers, toils and snares,
I have already come;
'Tis grace hath brought me safe thus far,
And grace will lead me home.

When we've been there ten thousand years,
Bright shining as the sun,
We've no less days to sing God's praise
Than when we'd first begun.`,
  },
  {
    id: 'sample-raghupati-raghav',
    title: 'Raghupati Raghav Raja Ram',
    language: 'Hindi',
    tag: 'Devotional',
    pitch: 'C, medium',
    lyrics: `रघुपति राघव राजा राम
पतित पावन सीताराम
सीताराम सीताराम
भज प्यारे तू सीताराम

ईश्वर अल्लाह तेरो नाम
सबको सन्मति दे भगवान`,
  },
  {
    id: 'sample-lords-prayer-ml',
    title: "Lord's Prayer (Malayalam)",
    language: 'Malayalam',
    tag: 'Devotional',
    pitch: '',
    lyrics: `സ്വർഗ്ഗസ്ഥനായ ഞങ്ങളുടെ പിതാവേ,
അങ്ങയുടെ നാമം പൂജിതമാകണമേ.
അങ്ങയുടെ രാജ്യം വരണമേ.
അങ്ങയുടെ തിരുമനസ്സ്
സ്വർഗ്ഗത്തിലെപ്പോലെ ഭൂമിയിലും ആകണമേ.

അന്നന്നുവേണ്ട ആഹാരം ഇന്നും ഞങ്ങൾക്കു തരണമേ.
ഞങ്ങളോടു തെറ്റു ചെയ്തവരോടു ഞങ്ങൾ ക്ഷമിക്കുന്നതുപോലെ
ഞങ്ങളുടെ തെറ്റുകൾ ഞങ്ങളോടു ക്ഷമിക്കണമേ.
ഞങ്ങളെ പരീക്ഷയിൽ ഉൾപ്പെടുത്തരുതേ;
തിന്മയിൽനിന്നു ഞങ്ങളെ രക്ഷിക്കണമേ.
ആമേൻ.`,
  },
  {
    id: 'sample-al-fatiha',
    title: 'Al-Fatiha',
    language: 'Arabic',
    tag: 'Devotional',
    pitch: '',
    lyrics: `بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ
الرَّحْمَٰنِ الرَّحِيمِ
مَالِكِ يَوْمِ الدِّينِ
إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ
اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ
صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ`,
  },
]

export const sampleSongs = () => RAW.map((s) => ({ ...s, createdAt: T, updatedAt: T, sample: true }))

export const samplePlaylist = () => ({
  id: 'sample-setlist',
  name: 'Sample setlist',
  items: [
    { id: 'sample-setlist-0', songId: 'sample-amazing-grace' },
    { id: 'sample-setlist-1', songId: 'sample-lords-prayer-ml' },
  ],
})
