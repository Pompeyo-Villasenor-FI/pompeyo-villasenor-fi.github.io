/**
 * Lógica principal del sitio de campaña Niño – Villaseñor (Consejo Técnico FI 2026–2030)
 * Implementa sincronización accesible de validación (`:user-invalid` + ARIA) y manejo de envío.
 */

(() => {
  'use strict';

  // 1. Fallback con WeakMap para navegadores que no soporten `:user-invalid`
  const UserInvalidFallback = (() => {
    const dirtyState = new WeakMap();

    const updateState = (input) => {
      const isValid = input.checkValidity();
      input.classList.toggle('user-invalid-fallback', !isValid);
      input.classList.toggle('user-valid-fallback', isValid);

      if (!isValid) {
        input.setAttribute('aria-invalid', 'true');
      } else {
        input.removeAttribute('aria-invalid');
      }
    };

    const handleEvent = (event) => {
      const input = event.target;

      if (event.type === 'reset') {
        const controls = input.elements || [];
        for (const control of controls) {
          dirtyState.delete(control);
          control.classList.remove('user-invalid-fallback', 'user-valid-fallback');
          control.removeAttribute('aria-invalid');
        }
        return;
      }

      if (!input || typeof input.checkValidity !== 'function') return;

      if (event.type === 'input' || event.type === 'change') {
        const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
        state.hasInteracted = true;
        dirtyState.set(input, state);
        if (state.hasBlurred) {
          updateState(input);
        }
      } else if (event.type === 'blur') {
        const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
        state.hasBlurred = true;
        dirtyState.set(input, state);
        if (state.hasInteracted) {
          updateState(input);
        }
      }
    };

    const init = (root = document) => {
      if (typeof CSS !== 'undefined' && CSS.supports('selector(:user-invalid)')) return;
      root.addEventListener('blur', handleEvent, true);
      root.addEventListener('input', handleEvent);
      root.addEventListener('change', handleEvent);
      root.addEventListener('reset', handleEvent, true);
    };

    return { init };
  })();

  // 2. Sincronización de `aria-invalid` con el estado visual `:user-invalid`
  const setupFormValidationAndSubmission = () => {
    const form = document.getElementById('suggestion-form');
    if (!form) return;

    UserInvalidFallback.init(form);

    const syncAriaInvalid = (control) => {
      if (!control || typeof control.checkValidity !== 'function') return;
      if (!control.checkValidity()) {
        control.setAttribute('aria-invalid', 'true');
      } else {
        control.removeAttribute('aria-invalid');
      }
    };

    // Validar al salir del campo (blur)
    form.addEventListener(
      'blur',
      (e) => {
        if (e.target.matches('input, textarea')) {
          syncAriaInvalid(e.target);
        }
      },
      true
    );

    // Limpiar el estado de error inmediatamente al corregir (input)
    form.addEventListener('input', (e) => {
      if (e.target.matches('input, textarea') && e.target.checkValidity()) {
        e.target.removeAttribute('aria-invalid');
      }
    });

    // Alternar visibilidad de campos de contacto cuando se elige modalidad anónima
    const modContacto = document.getElementById('mod-contacto');
    const modAnonima = document.getElementById('mod-anonima');
    const contactoGroup = document.getElementById('datos-contacto-group');
    const nombreInput = document.getElementById('nombre-docente');
    const correoInput = document.getElementById('correo-docente');

    const updateModalidadUI = () => {
      if (!contactoGroup) return;
      const isAnonima = modAnonima && modAnonima.checked;
      contactoGroup.style.display = isAnonima ? 'none' : 'block';
      if (isAnonima) {
        if (nombreInput) nombreInput.value = '';
        if (correoInput) {
          correoInput.value = '';
          correoInput.removeAttribute('aria-invalid');
        }
      }
    };

    if (modContacto && modAnonima) {
      modContacto.addEventListener('change', updateModalidadUI);
      modAnonima.addEventListener('change', updateModalidadUI);
    }

    // Manejo de envío del formulario
    const submitBtn = document.getElementById('submit-btn');
    const statusBox = document.getElementById('form-status');

    form.addEventListener('submit', async (e) => {
      form.querySelectorAll('input, textarea').forEach(syncAriaInvalid);

      if (!form.checkValidity()) {
        return;
      }

      e.preventDefault();

      // Deshabilitar botón tras clic válido para evitar envíos duplicados
      if (submitBtn) {
        submitBtn.disabled = true;
      }

      const formData = new FormData(form);
      const endpoint = form.getAttribute('action') || '';

      try {
        // Si ya se configuró un ID real de Formspree, enviamos por POST
        if (endpoint && !endpoint.includes('PENDIENTE_ID')) {
          const response = await fetch(endpoint, {
            method: 'POST',
            body: formData,
            headers: { Accept: 'application/json' },
          });

          if (!response.ok) {
            throw new Error('No se pudo completar el envío remoto.');
          }
        } else {
          // Respaldo local mientras se configura el correo definitivo
          const savedList = JSON.parse(localStorage.getItem('sugerencias_campana') || '[]');
          savedList.push({
            fecha: new Date().toISOString(),
            modalidad: formData.get('modalidad'),
            nombre: formData.get('nombre') || 'Anónimo',
            email: formData.get('email') || 'No especificado',
            categoria: formData.get('categoria'),
            eje_tematico: formData.get('eje_tematico'),
            mensaje: formData.get('mensaje'),
          });
          localStorage.setItem('sugerencias_campana', JSON.stringify(savedList));
        }

        if (statusBox) {
          statusBox.className = 'form-status form-status--success is-visible';
          statusBox.textContent =
            '✓ ¡Muchas gracias por tu participación! Tu sugerencia ha sido registrada para el plan de trabajo de la fórmula Niño – Villaseñor.';
        }

        form.reset();
        updateModalidadUI();
      } catch (err) {
        if (statusBox) {
          statusBox.className = 'form-status is-visible';
          statusBox.style.backgroundColor = '#fce8e6';
          statusBox.style.color = '#a50e0e';
          statusBox.textContent =
            'Ocurrió un inconveniente al enviar el formulario. Por favor intenta nuevamente en unos momentos.';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
        }
      }
    });
  };

  // 3. Scroll Reveal System (IntersectionObserver)
  // Cumple con Modern Web Guidance: `motion` y `scroll-entry-exit-effects`
  const setupScrollReveals = () => {
    // Si el usuario prefiere movimiento reducido, salir sin animaciones
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const revealElements = document.querySelectorAll('.reveal');
    if (!revealElements.length) return;

    if (!('IntersectionObserver' in window)) {
      revealElements.forEach((el) => el.classList.add('is-revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -30px 0px',
      }
    );

    revealElements.forEach((el) => observer.observe(el));
  };

  document.addEventListener('DOMContentLoaded', () => {
    setupFormValidationAndSubmission();
    setupScrollReveals();
  });
})();

