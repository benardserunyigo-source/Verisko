export function openRolePreview(){
 let dialog=document.getElementById('rolePreviewDialog');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='rolePreviewDialog';dialog.className='role-preview-dialog';dialog.setAttribute('aria-labelledby','rolePreviewTitle');dialog.innerHTML='<header class="role-preview-bar"><div><strong id="rolePreviewTitle">Preview a team role</strong><p>Sample data. No changes or tracking.</p></div><label>View as <select id="rolePreviewSelect"><option value="sales">Sales</option><option value="operations">Operations</option><option value="installer">Installer</option></select></label><button type="button" class="btn btn-primary" id="rolePreviewExit">Back to Admin</button></header><iframe id="rolePreviewFrame" title="Sales role preview" sandbox="allow-scripts allow-same-origin" allow="geolocation \'none\'; camera \'none\'; microphone \'none\'"></iframe>';document.body.append(dialog);
  const select=dialog.querySelector('select'),frame=dialog.querySelector('iframe');select.onchange=()=>{frame.title=select.options[select.selectedIndex].text+' role preview';frame.src='./index.html?rolePreview='+select.value;};
  function close(){frame.src='about:blank';dialog.close();document.getElementById('userChip')?.focus();}
  dialog.querySelector('#rolePreviewExit').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 }
 dialog.querySelector('select').value='sales';dialog.querySelector('iframe').src='./index.html?rolePreview=sales';dialog.showModal();dialog.querySelector('select').focus();
}
