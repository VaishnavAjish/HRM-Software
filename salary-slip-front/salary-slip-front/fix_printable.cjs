const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'forms', 'PrintableForm.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// FormRow
content = content.replace(
  'className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-2 py-1"',
  'className="flex flex-row items-end gap-2 py-1"'
);
content = content.replace(
  'className="text-[13px] font-bold sm:whitespace-nowrap w-full sm:w-[130px] sm:shrink-0 text-black leading-normal"',
  'className="text-[13px] font-bold whitespace-nowrap w-[130px] shrink-0 text-black leading-normal"'
);
content = content.replace(
  '<span className="font-bold text-black hidden sm:inline">:</span>',
  '<span className="font-bold text-black inline">:</span>'
);

// Grid 12
content = content.replace(
  '<div className="flex flex-col md:grid md:grid-cols-12 gap-6 items-start">',
  '<div className="grid grid-cols-12 gap-6 items-start">'
);
content = content.replace(
  '<div className="md:col-span-5 flex flex-col items-center">',
  '<div className="col-span-5 flex flex-col items-center">'
);
content = content.replace(
  '<div className="md:col-span-7 space-y-3 w-full">',
  '<div className="col-span-7 space-y-3 w-full">'
);

// Punching No
content = content.replace(
  '<div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">',
  '<div className="flex flex-row items-center gap-2">'
);
content = content.replace(
  '<label className="font-bold w-full sm:w-[130px] sm:shrink-0 text-[13px] text-black">',
  '<label className="font-bold w-[130px] shrink-0 text-[13px] text-black">'
);

// Name
content = content.replace(
  '<div className="flex flex-col sm:flex-row items-start gap-1 sm:gap-2">',
  '<div className="flex flex-row items-start gap-2">'
);
content = content.replace(
  '<label className="font-bold w-full sm:w-[130px] sm:shrink-0 pt-1 text-[13px] text-black">',
  '<label className="font-bold w-[130px] shrink-0 pt-1 text-[13px] text-black">'
);

// Grids
content = content.replace(
  '<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full">',
  '<div className="grid grid-cols-3 gap-6 w-full">'
);
content = content.replace(
  '<div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">',
  '<div className="grid grid-cols-2 gap-x-8 gap-y-1.5">'
);
content = content.replace(
  '<div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 font-bold text-[13px] text-black">',
  '<div className="mt-6 grid grid-cols-3 gap-8 font-bold text-[13px] text-black">'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed PrintableForm.jsx classes');
