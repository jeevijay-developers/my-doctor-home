-- Covering index for doctor_feature_overrides.feature_key's FK to features(key).
CREATE INDEX idx_doctor_feature_overrides_feature_key ON public.doctor_feature_overrides(feature_key);
