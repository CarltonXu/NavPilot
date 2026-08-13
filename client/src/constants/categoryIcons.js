export const CATEGORY_ICON_GROUPS = [
  {
    key: 'general',
    names: ['folder','grid','star','bookmark','tag','link','globe','compass','home','layers'],
  },
  {
    key: 'work',
    names: ['building','briefcase','users','calendar','mail','message','chart','target','shield','lock'],
  },
  {
    key: 'technology',
    names: ['code','terminal','database','server','cloud','network','cpu','monitor','mobile','tools'],
  },
  {
    key: 'content',
    names: ['docs','book','image','video','music','download','upload','archive','package','lab'],
  },
];

export const CATEGORY_ICONS = CATEGORY_ICON_GROUPS.flatMap(group =>
  group.names.map(name => `icon:${name}`),
);

