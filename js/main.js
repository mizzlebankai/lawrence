/* Lawrence Senior High School — shared site behavior */
document.addEventListener('DOMContentLoaded', function () {

  var body = document.body;
  var header = document.querySelector('.site-header');
  var isHeroPage = body.classList.contains('has-hero');
  var compactHeader = null;
  var scrolledHeader = null;
  var headerUpdatePending = false;

  function updateHeaderState() {
    if (!header) return;
    var scrollY = window.scrollY;
    var shouldCompact = scrollY > 100;
    var shouldBeScrolled = isHeroPage && scrollY > 60;

    if (shouldCompact !== compactHeader) {
      header.classList.toggle('is-compact', shouldCompact);
      compactHeader = shouldCompact;
    }
    if (shouldBeScrolled !== scrolledHeader) {
      header.classList.toggle('is-scrolled', shouldBeScrolled);
      scrolledHeader = shouldBeScrolled;
    }
    if (!isHeroPage && !header.classList.contains('is-solid')) {
      header.classList.add('is-solid');
    }
  }

  function scheduleHeaderUpdate() {
    if (headerUpdatePending) return;
    headerUpdatePending = true;
    window.requestAnimationFrame(function () {
      updateHeaderState();
      headerUpdatePending = false;
    });
  }
  updateHeaderState();
  window.addEventListener('scroll', scheduleHeaderUpdate, { passive: true });

  var toggleBtn = document.querySelector('.menu-toggle');
  var closeBtn = document.querySelector('.mobile-menu-close');
  var mobileMenu = document.querySelector('.mobile-menu');

  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');

  function setMenuIconState(open) {
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', String(open));
      toggleBtn.setAttribute('aria-label', open ? 'Close full menu' : 'Open full menu');
    }
    if (!toggleBtn || !toggleBtn.querySelectorAll('span').length) return;
    var spans = toggleBtn.querySelectorAll('span');
    spans.forEach(function (span, index) {
      if (open) {
        if (index === 0) span.style.transform = 'translateY(7px) rotate(45deg)';
        if (index === 1) span.style.opacity = '0';
        if (index === 2) span.style.transform = 'translateY(-7px) rotate(-45deg)';
      } else {
        span.style.transform = 'none';
        span.style.opacity = '1';
      }
    });
  }

  function openMenu() {
    if (!mobileMenu) return;
    if (mobileMenu.tagName === 'DIALOG') {
      if (!mobileMenu.open) mobileMenu.showModal();
    } else {
      mobileMenu.classList.add('is-open');
    }
    body.classList.add('menu-open');
  }

  function closeMenu() {
    if (!mobileMenu) return;
    if (mobileMenu.tagName === 'DIALOG') {
      if (mobileMenu.open) mobileMenu.close();
    } else {
      mobileMenu.classList.remove('is-open');
    }
    body.classList.remove('menu-open');
  }

  if (toggleBtn) toggleBtn.addEventListener('click', function () {
    if (mobileMenu && mobileMenu.tagName === 'DIALOG' && mobileMenu.open) {
      closeMenu();
      setMenuIconState(false);
      return;
    }
    openMenu();
    setMenuIconState(true);
  });

  if (closeBtn) closeBtn.addEventListener('click', function () {
    closeMenu();
    setMenuIconState(false);
  });

  if (mobileMenu) {
    mobileMenu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        closeMenu();
        setMenuIconState(false);
      });
    });
  }

  var revealEls = document.querySelectorAll('.reveal, [data-fade], [data-fade-stagger]');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  } else if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px 80px 0px' });
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  var counters = document.querySelectorAll('[data-count-to]');
  if ('IntersectionObserver' in window && counters.length) {
    var counterIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseFloat(el.getAttribute('data-count-to'));
        var decimals = (el.getAttribute('data-count-to').split('.')[1] || '').length;
        var duration = reduceMotion ? 0 : 850;
        var start = null;

        if (duration === 0) {
          el.textContent = target.toFixed(decimals);
          counterIO.unobserve(el);
          return;
        }

        function step(ts) {
          if (!start) start = ts;
          var progress = Math.min((ts - start) / duration, 1);
          var eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = (target * eased).toFixed(decimals);
          if (progress < 1) requestAnimationFrame(step);
          else el.textContent = target.toFixed(decimals);
        }
        requestAnimationFrame(step);
        counterIO.unobserve(el);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { counterIO.observe(el); });
  }

  var currentPage = (window.location.pathname.split('/').pop() || 'index.html');
  document.querySelectorAll('.primary-nav a, .mobile-menu nav a').forEach(function (a) {
    var href = a.getAttribute('href');
    if (href === currentPage) a.classList.add('is-active');
  });

  var newsletterForm = document.getElementById('newsletterForm');
  if (newsletterForm) {
    var newsletterStatus = document.getElementById('newsletterStatus');
    var newsletterSubmit = document.getElementById('newsletterSubmit');
    newsletterForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      newsletterForm.classList.add('was-validated');
      if (!newsletterForm.checkValidity()) return;

      newsletterStatus.classList.remove('is-error');
      if (document.getElementById('newsletterWebsite').value) {
        newsletterStatus.textContent = 'Thanks for subscribing.';
        newsletterForm.reset();
        return;
      }

      var client = window.lawrenceSupabase;
      if (!client) {
        newsletterStatus.textContent = 'Newsletter signup is temporarily unavailable. Please try again later.';
        newsletterStatus.classList.add('is-error');
        return;
      }

      newsletterSubmit.disabled = true;
      newsletterSubmit.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Subscribing...';
      try {
        var { data, error } = await client.functions.invoke('newsletter', {
          body: {
            action: 'subscribe',
            full_name: document.getElementById('newsletterName').value.trim(),
            email: document.getElementById('newsletterEmail').value.trim().toLowerCase(),
            interest_area: document.getElementById('newsletterInterest').value,
            consent_given: true,
            website: document.getElementById('newsletterWebsite').value
          }
        });
        if (error) {
          throw error;
        }
        newsletterStatus.textContent = data?.message || 'Check your inbox for a confirmation link.';
        newsletterForm.reset();
        newsletterForm.classList.remove('was-validated');
      } catch (error) {
        newsletterStatus.textContent = 'We could not send a confirmation email right now. Please try again later.';
        newsletterStatus.classList.add('is-error');
      } finally {
        newsletterSubmit.disabled = false;
        newsletterSubmit.innerHTML = 'Subscribe <i class="bi bi-arrow-right ms-1" aria-hidden="true"></i>';
      }
    });
  }

  var applyForm = document.getElementById('admissionForm');
  if (applyForm) {
    var programSelect = document.getElementById('fProgram');
    var specializationSelect = document.getElementById('fSpecialization');
    var collegeFields = document.getElementById('collegeFields');
    var collegeProgramInput = document.getElementById('collegeProgram');

    function updateAdmissionOptions() {
      var selectedCategory = programSelect.value;
      Array.from(specializationSelect.options).forEach(function (option) {
        if (!option.dataset.category) return;
        option.hidden = option.dataset.category !== selectedCategory;
      });
      specializationSelect.value = '';

      var isCollege = selectedCategory === 'college';
      collegeFields.classList.toggle('d-none', !isCollege);
      collegeFields.setAttribute('aria-hidden', String(!isCollege));
      collegeFields.querySelectorAll('input, textarea').forEach(function (input) {
        input.disabled = !isCollege;
      });
      collegeProgramInput.required = isCollege;
    }

    programSelect.addEventListener('change', updateAdmissionOptions);

    applyForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!applyForm.checkValidity()) {
        applyForm.classList.add('was-validated');
        return;
      }

      var client = window.lawrenceSupabase;
      if (!client) {
        showApplicationError('Online applications are temporarily unavailable. Please contact the admissions office.');
        return;
      }

      var programSelect = document.getElementById('fProgram');
      var programType = getProgramType(programSelect.value);
      var programName = programSelect.options[programSelect.selectedIndex]?.text || '';

      var firstName = document.getElementById('fFirstName')?.value?.trim() || '';
      var surname = document.getElementById('fSurname')?.value?.trim() || '';
      var otherNames = document.getElementById('fOtherNames')?.value?.trim() || '';
      var applicantName = [firstName, otherNames, surname].filter(Boolean).join(' ');
      var selectedSpecialization = specializationSelect.options[specializationSelect.selectedIndex]?.text || '';
      var formValues = {
        first_name: firstName,
        surname: surname,
        other_names: otherNames,
        applicant_name: applicantName,
        email: document.getElementById('fEmail').value.trim(),
        phone: document.getElementById('fPhone').value.trim(),
        guardian_name: document.getElementById('pName').value.trim(),
        guardian_phone: document.getElementById('pPhone').value.trim(),
        guardian_email: document.getElementById('pEmail').value.trim(),
        guardian_relationship: document.getElementById('pRelation').value.trim(),
        guardian_address: document.getElementById('pAddress').value.trim(),
        father_name: document.getElementById('fatherName').value.trim(),
        father_occupation: document.getElementById('fatherOccupation').value.trim(),
        father_phone: document.getElementById('fatherPhone').value.trim(),
        father_nationality: document.getElementById('fatherNationality').value.trim(),
        father_home_town: document.getElementById('fatherHomeTown').value.trim(),
        father_address: document.getElementById('fatherAddress').value.trim(),
        mother_name: document.getElementById('motherName').value.trim(),
        mother_occupation: document.getElementById('motherOccupation').value.trim(),
        mother_phone: document.getElementById('motherPhone').value.trim(),
        mother_nationality: document.getElementById('motherNationality').value.trim(),
        mother_home_town: document.getElementById('motherHomeTown').value.trim(),
        mother_address: document.getElementById('motherAddress').value.trim(),
        program_type: programType,
        program_name: programName,
        specialization: selectedSpecialization,
        entry_level: document.getElementById('fEntryLevel').value.trim(),
        intake_year: document.getElementById('fYear').value,
        date_of_birth: document.getElementById('fDob').value,
        gender: document.getElementById('fGender').value,
        nationality: document.getElementById('fNationality').value.trim(),
        religion: document.getElementById('fReligion').value.trim(),
        home_town: document.getElementById('fHomeTown').value.trim(),
        previous_school: document.getElementById('fJHS').value.trim(),
        bece_index: document.getElementById('fBECE').value.trim(),
        applicant_address: document.getElementById('fAddress').value.trim(),
        residency: document.getElementById('fResidency').value,
        college_program: document.getElementById('collegeProgram').value.trim(),
        college_qualification: document.getElementById('collegeQualification').value.trim(),
        college_reason: document.getElementById('collegeReason').value.trim(),
        health_condition: document.getElementById('fHealth').value,
        health_details: document.getElementById('fHealthDetails').value.trim(),
        allergy_status: document.getElementById('fAllergies').value,
        allergy_details: document.getElementById('fAllergyDetails').value.trim(),
        special_needs: document.getElementById('fNotes').value.trim()
      };

      var referenceNumber = buildApplicationReference(programType, new Date().getFullYear());
      formValues.reference_number = referenceNumber;
      var submitButton = applyForm.querySelector('[type="submit"]');
      var originalButtonText = submitButton.innerHTML;
      submitButton.disabled = true;
      submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Submitting...';

      try {
        formValues.documents = await uploadApplicationDocuments(client, referenceNumber);
        var payload = {
          reference_number: referenceNumber,
          program_type: programType,
          applicant_name: formValues.applicant_name,
          email: formValues.email,
          phone: formValues.phone,
          guardian_name: formValues.guardian_name,
          guardian_phone: formValues.guardian_phone,
          status: programType === 'college' ? 'waitlisted' : 'submitted',
          intake_year: Number(formValues.intake_year || new Date().getFullYear()),
          consent_given: document.getElementById('fConsent').checked,
          form_data: formValues
        };
        var { data: submission, error } = await client.functions.invoke('newsletter', {
          body: { action: 'submit_application', application: payload }
        });
        if (error) throw error;
        if (submission?.error) throw new Error(submission.error);
        if (!submission?.application) throw new Error('Application submission was not confirmed.');

        populateApplicationSummary(formValues, submission.application, payload.status);
        var verificationNotice = document.getElementById('applicationEmailVerificationNotice');
        var resendButton = document.getElementById('resendApplicationVerification');
        if (submission.verification_sent) {
          verificationNotice.textContent = 'A verification link has been sent to ' + formValues.email + '. Verify this address to receive admission status updates.';
        } else {
          verificationNotice.textContent = 'Your application was received, but we could not send the verification email. You can try again below or contact Admissions.';
          resendButton.classList.remove('d-none');
        }
        resendButton.dataset.reference = referenceNumber;
        resendButton.dataset.email = formValues.email;

        applyForm.classList.add('d-none');
        var confirmBox = document.getElementById('applySuccess');
        if (confirmBox) confirmBox.classList.remove('d-none');
        window.scrollTo({ top: confirmBox.offsetTop - 120, behavior: 'smooth' });
      } catch (error) {
        console.error('Application submission failed:', error);
        showApplicationError(error.message && error.message.includes('Bucket not found')
          ? 'Document storage is not configured yet. Please contact the admissions office or try again later.'
          : 'There was a problem submitting your application. Please try again in a moment.');
      } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;
      }
    });

    var resendVerificationButton = document.getElementById('resendApplicationVerification');
    resendVerificationButton.addEventListener('click', async function () {
      var client = window.lawrenceSupabase;
      if (!client) return;
      resendVerificationButton.disabled = true;
      resendVerificationButton.textContent = 'Sending...';
      try {
        var { data, error } = await client.functions.invoke('newsletter', {
          body: {
            action: 'resend_application_verification',
            reference_number: resendVerificationButton.dataset.reference,
            email: resendVerificationButton.dataset.email
          }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        document.getElementById('applicationEmailVerificationNotice').textContent = data?.message || 'If the application is eligible, a verification link has been sent.';
        resendVerificationButton.classList.add('d-none');
      } catch (error) {
        document.getElementById('applicationEmailVerificationNotice').textContent = 'We could not send the link. Please try again or contact Admissions.';
        resendVerificationButton.disabled = false;
        resendVerificationButton.textContent = 'Resend email verification link';
      }
    });
  }

  function showApplicationError(message) {
    var alert = document.getElementById('applicationError');
    if (!alert) return;
    alert.textContent = message;
    alert.classList.remove('d-none');
    alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function uploadApplicationDocuments(client, referenceNumber) {
    var uploads = [
      { id: 'fPassport', label: 'Passport photo', maxSize: 2 * 1024 * 1024 },
      { id: 'fResults', label: 'Report card / BECE results', maxSize: 5 * 1024 * 1024 },
      { id: 'fBirthCertificate', label: 'Birth certificate / ID', maxSize: 5 * 1024 * 1024 }
    ];
    var documents = [];

    for (var item of uploads) {
      var file = document.getElementById(item.id).files[0];
      if (!file) continue;
      if (file.size > item.maxSize) throw new Error(item.label + ' exceeds the allowed file size.');

      var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      var path = referenceNumber + '/' + item.id + '-' + safeName;
      var { error } = await client.storage.from('application-documents').upload(path, file, {
        cacheControl: '3600',
        upsert: false
      });
      if (error) throw error;
      documents.push({ label: item.label, file_name: file.name, path: path });
    }

    return documents;
  }

  function populateApplicationSummary(values, record, status) {
    var receivedDate = record.submitted_at ? new Date(record.submitted_at) : new Date();
    var displayValues = {
      summaryReference: record.reference_number || values.reference_number,
      summaryDate: receivedDate.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
      summaryBatch: values.intake_year,
      summaryStatus: ({ submitted: 'Pending Review', waitlisted: 'Waitlisted', in_review: 'In Review', accepted: 'Accepted', rejected: 'Rejected' })[status] || status,
      summaryName: values.applicant_name,
      summaryDob: formatDate(values.date_of_birth),
      summaryGender: values.gender,
      summaryNationality: values.nationality,
      summaryReligion: values.religion,
      summaryHomeTown: values.home_town,
      summaryPhone: values.phone,
      summaryEmail: values.email,
      summarySchool: values.previous_school,
      summaryBece: values.bece_index,
      summaryAddress: values.applicant_address,
      summaryProgram: values.program_name,
      summarySpecialization: values.specialization,
      summaryEntryLevel: values.entry_level,
      summaryYear: values.intake_year,
      summaryResidency: values.residency,
      summaryFatherName: values.father_name,
      summaryFatherDetails: [values.father_occupation, values.father_phone, values.father_nationality, values.father_home_town, values.father_address].filter(Boolean).join(' / '),
      summaryMotherName: values.mother_name,
      summaryMotherDetails: [values.mother_occupation, values.mother_phone, values.mother_nationality, values.mother_home_town, values.mother_address].filter(Boolean).join(' / '),
      summaryGuardian: values.guardian_name,
      summaryRelationship: values.guardian_relationship,
      summaryGuardianPhone: values.guardian_phone,
      summaryGuardianEmail: values.guardian_email,
      summaryGuardianAddress: values.guardian_address,
      summaryHealth: values.health_condition,
      summaryAllergies: values.allergy_status,
      summaryHealthDetails: values.health_details,
      summaryAllergyDetails: values.allergy_details,
      summarySpecialNeeds: values.special_needs
    };

    Object.keys(displayValues).forEach(function (id) {
      var element = document.getElementById(id);
      if (element) element.textContent = displayValues[id] || 'Not provided';
    });

    var collegeRow = document.getElementById('summaryCollegeRow');
    if (values.program_type === 'college') {
      collegeRow.hidden = false;
      document.getElementById('summaryCollege').textContent = [values.college_program, values.college_qualification, values.college_reason].filter(Boolean).join(' | ') || 'Not provided';
    }

    var documentList = document.getElementById('summaryDocuments');
    documentList.replaceChildren();
    if (values.documents.length) {
      values.documents.forEach(function (file) {
        var item = document.createElement('li');
        item.textContent = file.label + ': ' + file.file_name;
        documentList.appendChild(item);
      });
    } else {
      var emptyItem = document.createElement('li');
      emptyItem.textContent = 'No documents attached';
      documentList.appendChild(emptyItem);
    }
  }

  function getProgramType(programValue) {
    if (!programValue) return 'shs';
    var normalized = String(programValue).toLowerCase();
    if (normalized.includes('remedial')) return 'remedial';
    if (normalized.includes('college')) return 'college';
    return 'shs';
  }

  function buildApplicationReference(programType, year) {
    var prefixMap = {
      shs: 'LSHS',
      remedial: 'LREM',
      college: 'LCOL'
    };
    var prefix = prefixMap[programType] || 'LAPP';
    var randomNumber = Math.floor(1000 + Math.random() * 8999);
    return prefix + '-' + year + '-' + randomNumber;
  }

  function formatDate(dateString) {
    if (!dateString) return 'Not provided';
    var date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }
});
