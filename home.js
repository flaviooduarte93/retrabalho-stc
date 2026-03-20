// js/home.js
// Controla a navegação e o modal de senha da tela inicial

const SENHA = 'eqtlstcgyn26';

document.addEventListener('DOMContentLoaded', () => {
  const btnAlertas      = document.getElementById('btn-alertas');
  const modalSenha      = document.getElementById('modal-senha');
  const inputSenha      = document.getElementById('input-senha');
  const modalError      = document.getElementById('modal-error');
  const btnCancelModal  = document.getElementById('btn-cancel-modal');
  const btnConfirmModal = document.getElementById('btn-confirm-modal');

  if (!btnAlertas) return;

  btnAlertas.addEventListener('click', e => {
    e.preventDefault();
    modalSenha.style.display = 'flex';
    setTimeout(() => inputSenha.focus(), 100);
  });

  btnCancelModal.addEventListener('click', () => {
    modalSenha.style.display = 'none';
    inputSenha.value = '';
    modalError.style.display = 'none';
  });

  btnConfirmModal.addEventListener('click', () => verificarSenha());

  inputSenha.addEventListener('keydown', e => {
    if (e.key === 'Enter') verificarSenha();
  });

  function verificarSenha() {
    if (inputSenha.value === SENHA) {
      window.location.href = 'alertas.html';
    } else {
      modalError.style.display = 'block';
      inputSenha.select();
    }
  }

  // Fecha modal ao clicar fora
  modalSenha.addEventListener('click', e => {
    if (e.target === modalSenha) {
      modalSenha.style.display = 'none';
      inputSenha.value = '';
      modalError.style.display = 'none';
    }
  });
});
