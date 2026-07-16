Pod::Spec.new do |s|
  s.name           = 'PaperTextInput'
  s.version        = '1.0.0'
  s.summary        = 'Synchronous bounded Paper text input for Soies'
  s.description    = 'A local Expo view that rejects text exceeding the canonical Paper canvas before paint.'
  s.author         = 'Soies'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
