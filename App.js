public/app.js
const form = document.querySelector('#builder');
const statusBox = document.querySelector('#status');
const manuscriptFile = document.querySelector('#manuscriptFile');
const fileName = document.querySelector('#fileName');
const manuscriptEditor = document.querySelector('#manuscript');
const sample = `Chapter 1: The Beginning\n\nEvery meaningful journey begins with a decision. This is the story of learning to turn intention into disciplined action.\n\nThe first step was not perfect, but it created momentum.\n\nChapter 2: Building the Foundation\n\nStrong outcomes require strong foundations. We learn, test, revise, and keep what works.`;
manuscriptFile.addEventListener('change', async () => {
 const file = manuscriptFile.files && manuscriptFile.files[0];
 if (!file) { fileName.textContent = 'No file selected'; return; }
 const lowerName = file.name.toLowerCase();
 const isTxt = lowerName.endsWith('.txt');
 const isDocx = lowerName.endsWith('.docx');
 if (!isTxt && !isDocx) {
  statusBox.textContent = 'Please select a .txt or .docx manuscript file.';
  manuscriptFile.value = '';
  fileName.textContent = 'No file selected';
  return;
 }
 if (file.size > 10 * 1024 * 1024) {
  statusBox.textContent = 'The manuscript is too large. Maximum upload size is 10 MB.';
  manuscriptFile.value = '';
  fileName.textContent = 'No file selected';
  return;
 }
 if (manuscriptEditor.value.trim() && !window.confirm('Replace the text currently in the manuscript editor with this file?')) {
  manuscriptFile.value = '';
  return;
 }
 try {
  statusBox.textContent = isDocx ? 'Extracting text from your Word document…' : 'Loading your text manuscript…';
  const upload = new FormData();
  upload.append('manuscript', file);
  const response = await fetch('/api/upload', { method: 'POST', body: upload });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not import this manuscript.');
  if (!result.text || !result.text.trim()) throw new Error('No readable text was found in this file.');
  manuscriptEditor.value = result.text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  fileName.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
  statusBox.textContent = `${isDocx ? 'Word document' : 'Text file'} imported. Review the manuscript below before building your document.`;
 } catch (error) {
  statusBox.textContent = error.message || 'Could not read this file. Please try another .txt or .docx file.';
  manuscriptFile.value = '';
  fileName.textContent = 'No file selected';
 }
});
document.querySelector('#sample').addEventListener('click',()=>{form.elements.title.value='The Power of a New Beginning';form.elements.author.value='Alex Morgan';form.elements.manuscript.value=sample;fileName.textContent='Sample manuscript loaded';manuscriptFile.value='';});
document.querySelector('#clear').addEventListener('click',()=>{form.reset();form.elements.manuscript.value='';manuscriptFile.value='';fileName.textContent='No file selected';statusBox.textContent='';});
form.addEventListener('submit', async e=>{
 e.preventDefault(); const button=form.querySelector('.build'); button.disabled=true; statusBox.textContent='Preparing your document…';
 const fd=new FormData(form); const data=Object.fromEntries(fd.entries());
 for(const key of ['autoEdit','copyrightPage','toc','mirror']) data[key]=form.elements[key].checked;
 try{
  const response=await fetch('/api/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  if(!response.ok){const err=await response.json();throw new Error(err.error||'Build failed');}
  const blob=await response.blob(); const disposition=response.headers.get('Content-Disposition')||''; const match=disposition.match(/filename="?([^";]+)"?/i); const filename=match?match[1]:'ready-writer-document';
  const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);statusBox.textContent='Your document has been generated and downloaded.';
 }catch(err){statusBox.textContent=err.message;}finally{button.disabled=false;}
});
