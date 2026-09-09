/**
 * German translations for Users module
 */
export const de = {
  // Page
  title: 'Team Management',
  subtitle: 'Verwalten Sie Ihr Team',

  // Status
  status: {
    active: 'Aktiv',
    inactive: 'Inaktiv',
  },

  // Fields
  fields: {
    user: 'Benutzer',
    email: 'E-Mail',
    firstName: 'Vorname',
    lastName: 'Nachname',
    department: 'Abteilung',
    position: 'Position',
    status: 'Status',
    joinDate: 'Beitrittsdatum',
    actions: 'Aktionen',
    role: 'Rolle',
    phone: 'Telefon',
    password: 'Passwort',
    confirmPassword: 'Passwort bestätigen',
    language: 'Sprache',
  },

  // Languages
  languages: {
    en: 'Englisch',
    de: 'Deutsch',
  },

  // Actions
  actions: {
    add: 'Benutzer hinzufügen',
    edit: 'Bearbeiten',
    delete: 'Löschen',
    export: 'Exportieren',
    save: 'Speichern',
    cancel: 'Abbrechen',
    retry: 'Erneut versuchen',
    saving: 'Speichern...',
    create: 'Benutzer erstellen',
    update: 'Benutzer aktualisieren',
  },

  // Form
  form: {
    createTitle: 'Benutzer erstellen',
    createDescription: 'Fügen Sie ein neues Teammitglied hinzu.',
    editTitle: 'Benutzer bearbeiten',
    editDescription: 'Aktualisieren Sie die Benutzerinformationen.',
    firstNamePlaceholder: 'Max',
    lastNamePlaceholder: 'Mustermann',
    emailPlaceholder: 'max.mustermann@beispiel.de',
    passwordPlaceholder: 'Passwort eingeben',
    passwordPlaceholderEdit: 'Leer lassen um aktuelles zu behalten',
    confirmPasswordPlaceholder: 'Passwort bestätigen',
    phonePlaceholder: '+49 123 456789',
    departmentPlaceholder: 'Entwicklung',
    positionPlaceholder: 'Softwareentwickler',
  },

  // Validation
  validation: {
    firstNameRequired: 'Vorname ist erforderlich',
    lastNameRequired: 'Nachname ist erforderlich',
    emailRequired: 'E-Mail ist erforderlich',
    emailInvalid: 'Ungültige E-Mail-Adresse',
    passwordRequired: 'Passwort ist erforderlich',
    passwordMinLength: 'Passwort muss mindestens 6 Zeichen haben',
    confirmPasswordRequired: 'Bitte bestätigen Sie das Passwort',
    passwordMismatch: 'Passwörter stimmen nicht überein',
  },

  // Pagination
  pagination: {
    previous: 'Zurück',
    next: 'Weiter',
    page: 'Seite',
    of: 'von',
  },

  // Messages
  messages: {
    loading: 'Lade Benutzer...',
    noUsers: 'Keine Benutzer gefunden',
    loadError: 'Fehler beim Laden der Benutzer',
    unknownError: 'Unbekannter Fehler',
    deleteConfirm: 'Möchten Sie diesen Benutzer wirklich löschen?',
    loginRequired: 'Bitte melden Sie sich an',
    loginRequiredDetail: 'Um Benutzer zu verwalten, müssen Sie eingeloggt sein.',
    createSuccess: 'Benutzer erfolgreich erstellt',
    updateSuccess: 'Benutzer erfolgreich aktualisiert',
    deleteSuccess: 'Benutzer erfolgreich gelöscht',
  },
};
