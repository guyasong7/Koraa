"""Custom storage backends.

One class, and it exists only to work around an upstream bug. See its docstring.
"""

from whitenoise.storage import CompressedManifestStaticFilesStorage


class JazzminSafeStaticFilesStorage(CompressedManifestStaticFilesStorage):
    """Manifest storage that tolerates jazzmin's one directory-valued {% static %}.

    jazzmin 3.0.5's templates/admin/base.html renders:

        data-theme-base="{% static 'vendor/bootswatch' %}"

    and the inline script three lines below it does

        link.getAttribute('data-theme-base') + '/' + savedTheme + '/bootstrap.min.css'

    to swap themes client-side. So the tag is being handed a *directory*. A
    directory is never a manifest entry, ManifestFilesMixin.stored_name() raises
    ValueError on the miss, and every page under /admin/ answers 500 — including
    the index you land on straight after logging in. It breaks in production only:
    DEBUG resolves {% static %} by joining the URL without consulting a manifest,
    so this is invisible locally.

    Returning the name unhashed is not a new behaviour invented here — Django
    already skips the manifest lookup for any static reference ending in '/' (see
    ManifestFilesMixin._url). This extends that to the one directory reference
    that omits the trailing slash. The unhashed tree is collected alongside the
    hashed copies, so the /static/vendor/bootswatch/<theme>/bootstrap.min.css
    that the switcher builds is a real file on disk and whitenoise serves it.

    Deliberately an allowlist rather than `manifest_strict = False`. Switching
    strictness off would also fix this, and is the fix most search results give,
    but it applies to the whole project: every future typo in a {% static %} path
    would degrade from a loud 500 into a silently broken asset. One named
    exception keeps that check everywhere it still earns its keep.

    Remove entries here once jazzmin gives that attribute a trailing slash.
    """

    DIRECTORY_REFERENCES = frozenset({"vendor/bootswatch"})

    def stored_name(self, name):
        if name in self.DIRECTORY_REFERENCES:
            return name
        return super().stored_name(name)
