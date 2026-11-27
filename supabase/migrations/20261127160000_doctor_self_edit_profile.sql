-- Doctor login self-edit: a second doctor may change ONLY their own bio, photo and signature.
-- Everything else about the doctor (name, registration number, fee, hours, status, primary flag,
-- slug, seats) stays owner-only through upsert_practitioner. The owner's own row syncs from Profile
-- and is refused here.

-- True when _name is exactly <clinic>/practitioners/<my practitioner id>/(photo|signature).<ext>
-- for the signed-in ACTIVE doctor login of that clinic. NULL/stranger/anon -> false.
CREATE OR REPLACE FUNCTION public.own_practitioner_upload_path(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
  SELECT COALESCE((
    SELECT sd.clinic::text = (storage.foldername(_name))[1]
       AND (storage.foldername(_name))[2] = 'practitioners'
       AND array_length(storage.foldername(_name), 1) = 3
       AND public.my_practitioner_id(sd.clinic)::text = (storage.foldername(_name))[3]
       AND storage.filename(_name) ~ '^(photo|signature)\.[A-Za-z0-9]{1,8}$'
       AND EXISTS (SELECT 1 FROM public.staff_members s
                    WHERE s.id = auth.uid() AND s.status = 'active' AND s.role = 'doctor'
                      AND s.practitioner_id = public.my_practitioner_id(sd.clinic))
    FROM (SELECT public.staff_doctor_id(auth.uid()) AS clinic) sd
  ), false)
$$;
REVOKE ALL ON FUNCTION public.own_practitioner_upload_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.own_practitioner_upload_path(text) TO authenticated;

-- Permissive: let that doctor login write their own two files.
DROP POLICY IF EXISTS "Doctor login uploads own practitioner files" ON storage.objects;
CREATE POLICY "Doctor login uploads own practitioner files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'doctor-uploads' AND public.own_practitioner_upload_path(name));
DROP POLICY IF EXISTS "Doctor login updates own practitioner files" ON storage.objects;
CREATE POLICY "Doctor login updates own practitioner files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'doctor-uploads' AND public.own_practitioner_upload_path(name))
  WITH CHECK (bucket_id = 'doctor-uploads' AND public.own_practitioner_upload_path(name));

-- Restrictive 'managers only' policies (20261126100700) also let that one path through.
DROP POLICY IF EXISTS "Doctor files only by managers (insert)" ON storage.objects;
CREATE POLICY "Doctor files only by managers (insert)" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'doctor-uploads'
              OR (storage.foldername(name))[2] IS DISTINCT FROM 'practitioners'
              OR (auth.uid())::text = (storage.foldername(name))[1]
              OR ((public.staff_doctor_id(auth.uid()))::text = (storage.foldername(name))[1]
                  AND COALESCE(public.staff_has_permission(auth.uid(), 'practitioners.manage'), false))
              OR public.own_practitioner_upload_path(name));

DROP POLICY IF EXISTS "Doctor files only by managers (update)" ON storage.objects;
CREATE POLICY "Doctor files only by managers (update)" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'doctor-uploads'
         OR (storage.foldername(name))[2] IS DISTINCT FROM 'practitioners'
         OR (auth.uid())::text = (storage.foldername(name))[1]
         OR ((public.staff_doctor_id(auth.uid()))::text = (storage.foldername(name))[1]
             AND COALESCE(public.staff_has_permission(auth.uid(), 'practitioners.manage'), false))
         OR public.own_practitioner_upload_path(name))
  WITH CHECK (bucket_id <> 'doctor-uploads'
              OR (storage.foldername(name))[2] IS DISTINCT FROM 'practitioners'
              OR (auth.uid())::text = (storage.foldername(name))[1]
              OR ((public.staff_doctor_id(auth.uid()))::text = (storage.foldername(name))[1]
                  AND COALESCE(public.staff_has_permission(auth.uid(), 'practitioners.manage'), false))
              OR public.own_practitioner_upload_path(name));

-- _bio / _photo_url / _signature_url: NULL = leave as it is, '' = clear, anything else = set.
-- URLs must be this clinic's public doctor-uploads URL for this doctor's own photo / signature file.
CREATE OR REPLACE FUNCTION public.update_my_practitioner_profile(
  _bio text DEFAULT NULL, _photo_url text DEFAULT NULL, _signature_url text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clinic uuid := public.staff_doctor_id(auth.uid());
  v_pid    uuid;
  v_bio    text := btrim(_bio);
  v_photo  text := btrim(_photo_url);
  v_sig    text := btrim(_signature_url);
  v_base   text;
BEGIN
  IF auth.uid() IS NULL OR v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  v_pid := public.my_practitioner_id(v_clinic);
  -- Must be a doctor LOGIN of this clinic linked to its own active practitioner (not reception,
  -- not another doctor, and never the owner's row, which is edited from Profile).
  IF v_pid IS NULL OR NOT COALESCE((
       SELECT true FROM public.staff_members s
        WHERE s.id = auth.uid() AND s.doctor_id = v_clinic AND s.status = 'active'
          AND s.role = 'doctor' AND s.practitioner_id = v_pid), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_bio IS NOT NULL AND char_length(v_bio) > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  END IF;
  v_base := '^https://[^/[:space:]]+/storage/v1/object/public/doctor-uploads/'
            || v_clinic::text || '/practitioners/' || v_pid::text || '/';
  IF v_photo IS NOT NULL AND v_photo <> '' AND
     (char_length(v_photo) > 500 OR v_photo !~ (v_base || 'photo\.[A-Za-z0-9]{1,8}(\?v=[0-9]{1,16})?$')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  END IF;
  IF v_sig IS NOT NULL AND v_sig <> '' AND
     (char_length(v_sig) > 500 OR v_sig !~ (v_base || 'signature\.[A-Za-z0-9]{1,8}(\?v=[0-9]{1,16})?$')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  END IF;

  UPDATE public.practitioners SET
    bio           = CASE WHEN v_bio   IS NULL THEN bio           ELSE NULLIF(v_bio, '')   END,
    photo_url     = CASE WHEN v_photo IS NULL THEN photo_url     ELSE NULLIF(v_photo, '') END,
    signature_url = CASE WHEN v_sig   IS NULL THEN signature_url ELSE NULLIF(v_sig, '')   END
  WHERE id = v_pid AND doctor_id = v_clinic AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_pid);
END;
$$;
REVOKE ALL ON FUNCTION public.update_my_practitioner_profile(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_practitioner_profile(text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
