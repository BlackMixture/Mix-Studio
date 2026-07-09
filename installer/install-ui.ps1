$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms

trap {
  [System.Windows.MessageBox]::Show(
    "MixBox Studio Setup could not open.`n`n$($_.Exception.Message)",
    'MixBox Studio Setup',
    [System.Windows.MessageBoxButton]::OK,
    [System.Windows.MessageBoxImage]::Error
  ) | Out-Null
  break
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SettingsFile = Join-Path $Root 'data\settings.json'
$InstallFile = Join-Path $Root 'install.json'
$ManifestFile = Join-Path $PSScriptRoot 'feature-manifest.json'
$EngineFile = Join-Path $PSScriptRoot 'install.ps1'

[xml]$Xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="MixBox Studio Setup" Width="980" Height="720" MinWidth="860" MinHeight="640"
        WindowStartupLocation="CenterScreen" Background="#000000" Foreground="#F6F8FF"
        FontFamily="Segoe UI" ResizeMode="CanResizeWithGrip">
  <Window.Resources>
    <SolidColorBrush x:Key="Surface" Color="#090B10"/>
    <SolidColorBrush x:Key="SurfaceRaised" Color="#10131B"/>
    <SolidColorBrush x:Key="Line" Color="#252A36"/>
    <SolidColorBrush x:Key="Muted" Color="#8E99B7"/>
    <SolidColorBrush x:Key="Soft" Color="#C9D2E7"/>
    <LinearGradientBrush x:Key="Spectrum" StartPoint="0,0" EndPoint="1,0">
      <GradientStop Color="#4285F4" Offset="0"/>
      <GradientStop Color="#EA4335" Offset="0.36"/>
      <GradientStop Color="#FBBC04" Offset="0.68"/>
      <GradientStop Color="#34A853" Offset="1"/>
    </LinearGradientBrush>
    <LinearGradientBrush x:Key="BlueGlow" StartPoint="0,0" EndPoint="1,1">
      <GradientStop Color="#182144" Offset="0"/>
      <GradientStop Color="#0E1322" Offset="1"/>
    </LinearGradientBrush>

    <Style TargetType="TextBox">
      <Setter Property="Foreground" Value="#F6F8FF"/>
      <Setter Property="Background" Value="#050609"/>
      <Setter Property="BorderBrush" Value="#252A36"/>
      <Setter Property="BorderThickness" Value="1"/>
      <Setter Property="Padding" Value="14,11"/>
      <Setter Property="FontSize" Value="14"/>
      <Setter Property="CaretBrush" Value="#F6F8FF"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="TextBox">
            <Border x:Name="InputBorder" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}"
                    BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="12">
              <ScrollViewer x:Name="PART_ContentHost" Margin="{TemplateBinding Padding}"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsKeyboardFocused" Value="True">
                <Setter TargetName="InputBorder" Property="BorderBrush" Value="#6F86C8"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>

    <Style x:Key="BaseButton" TargetType="Button">
      <Setter Property="Foreground" Value="#F6F8FF"/>
      <Setter Property="Background" Value="#10131B"/>
      <Setter Property="BorderBrush" Value="#2A303D"/>
      <Setter Property="BorderThickness" Value="1"/>
      <Setter Property="Padding" Value="20,11"/>
      <Setter Property="FontSize" Value="14"/>
      <Setter Property="FontWeight" Value="SemiBold"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border x:Name="ButtonBorder" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}"
                    BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="14" Padding="{TemplateBinding Padding}">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True">
                <Setter TargetName="ButtonBorder" Property="Background" Value="#171B26"/>
                <Setter TargetName="ButtonBorder" Property="BorderBrush" Value="#4A5368"/>
              </Trigger>
              <Trigger Property="IsPressed" Value="True">
                <Setter TargetName="ButtonBorder" Property="Opacity" Value="0.82"/>
              </Trigger>
              <Trigger Property="IsEnabled" Value="False">
                <Setter TargetName="ButtonBorder" Property="Opacity" Value="0.38"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>

    <Style x:Key="PrimaryButton" TargetType="Button" BasedOn="{StaticResource BaseButton}">
      <Setter Property="Background" Value="#111522"/>
      <Setter Property="BorderBrush" Value="{StaticResource Spectrum}"/>
      <Setter Property="BorderThickness" Value="2"/>
      <Setter Property="Padding" Value="26,12"/>
    </Style>

    <Style x:Key="IconButton" TargetType="Button" BasedOn="{StaticResource BaseButton}">
      <Setter Property="Padding" Value="12,8"/>
      <Setter Property="MinWidth" Value="72"/>
    </Style>

    <Style x:Key="FeatureToggle" TargetType="ToggleButton">
      <Setter Property="Foreground" Value="#F6F8FF"/>
      <Setter Property="Background" Value="#080A0F"/>
      <Setter Property="BorderBrush" Value="#242936"/>
      <Setter Property="BorderThickness" Value="1"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Margin" Value="0,0,0,10"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="ToggleButton">
            <Border x:Name="Card" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}"
                    BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="14" Padding="16,13">
              <Grid>
                <Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="48"/></Grid.ColumnDefinitions>
                <ContentPresenter VerticalAlignment="Center"/>
                <Border x:Name="Track" Grid.Column="1" Width="40" Height="22" CornerRadius="11" Background="#242936"
                        HorizontalAlignment="Right" VerticalAlignment="Center">
                  <Ellipse x:Name="Thumb" Width="16" Height="16" Fill="#8E99B7" HorizontalAlignment="Left" Margin="3,0"/>
                </Border>
              </Grid>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True">
                <Setter TargetName="Card" Property="BorderBrush" Value="#465069"/>
              </Trigger>
              <Trigger Property="IsChecked" Value="True">
                <Setter TargetName="Card" Property="BorderBrush" Value="#596987"/>
                <Setter TargetName="Card" Property="Background" Value="#0D111A"/>
                <Setter TargetName="Track" Property="Background" Value="#3859B8"/>
                <Setter TargetName="Thumb" Property="Fill" Value="#F6F8FF"/>
                <Setter TargetName="Thumb" Property="HorizontalAlignment" Value="Right"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
  </Window.Resources>

  <Grid>
    <Grid.RowDefinitions><RowDefinition Height="78"/><RowDefinition Height="*"/><RowDefinition Height="82"/></Grid.RowDefinitions>

    <Border Grid.Row="0" Background="#020203" BorderBrush="#171A22" BorderThickness="0,0,0,1" Padding="26,14">
      <Grid>
        <Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
        <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
          <Border Width="48" Height="48" CornerRadius="15" BorderThickness="2" BorderBrush="{StaticResource Spectrum}"
                  Background="#090B10" Padding="8">
            <Viewbox>
              <Canvas Width="44" Height="46">
                <Polygon Points="22,2 40,12 22,22 4,12" Fill="#FBBC04"/>
                <Polygon Points="4,14 21,24 21,44 4,34" Fill="#4285F4"/>
                <Polygon Points="23,24 40,14 40,34 23,44" Fill="#7C4DFF"/>
              </Canvas>
            </Viewbox>
          </Border>
          <StackPanel Margin="14,0,0,0" VerticalAlignment="Center">
            <TextBlock Text="MixBox Studio" FontSize="20" FontWeight="Bold"/>
            <TextBlock Text="Portable setup" Foreground="{StaticResource Muted}" FontSize="12" Margin="0,3,0,0"/>
          </StackPanel>
        </StackPanel>
        <Button x:Name="CloseButton" Grid.Column="1" Style="{StaticResource IconButton}" Content="Close" VerticalAlignment="Center"/>
      </Grid>
    </Border>

    <Grid Grid.Row="1" Margin="26,22">
      <Grid.ColumnDefinitions><ColumnDefinition Width="220"/><ColumnDefinition Width="22"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>

      <StackPanel Grid.Column="0" Margin="0,8,0,0">
        <TextBlock Text="S E T U P" FontSize="11" FontWeight="Bold" Foreground="{StaticResource Muted}" Margin="4,0,0,14"/>
        <Border x:Name="Step0" CornerRadius="14" Padding="14,12" Background="#151925" Margin="0,0,0,6">
          <StackPanel Orientation="Horizontal"><Border x:Name="StepDot0" Width="24" Height="24" CornerRadius="12" Background="#4257FF"><TextBlock Text="1" HorizontalAlignment="Center" VerticalAlignment="Center" FontWeight="Bold"/></Border><TextBlock Text="Welcome" Margin="12,2,0,0" FontWeight="SemiBold"/></StackPanel>
        </Border>
        <Border x:Name="Step1" CornerRadius="14" Padding="14,12" Margin="0,0,0,6">
          <StackPanel Orientation="Horizontal"><Border x:Name="StepDot1" Width="24" Height="24" CornerRadius="12" Background="#1A1E28"><TextBlock Text="2" Foreground="{StaticResource Muted}" HorizontalAlignment="Center" VerticalAlignment="Center" FontWeight="Bold"/></Border><TextBlock Text="ComfyUI" Margin="12,2,0,0" Foreground="{StaticResource Muted}" FontWeight="SemiBold"/></StackPanel>
        </Border>
        <Border x:Name="Step2" CornerRadius="14" Padding="14,12" Margin="0,0,0,6">
          <StackPanel Orientation="Horizontal"><Border x:Name="StepDot2" Width="24" Height="24" CornerRadius="12" Background="#1A1E28"><TextBlock Text="3" Foreground="{StaticResource Muted}" HorizontalAlignment="Center" VerticalAlignment="Center" FontWeight="Bold"/></Border><TextBlock Text="Features" Margin="12,2,0,0" Foreground="{StaticResource Muted}" FontWeight="SemiBold"/></StackPanel>
        </Border>
        <Border x:Name="Step3" CornerRadius="14" Padding="14,12" Margin="0,0,0,6">
          <StackPanel Orientation="Horizontal"><Border x:Name="StepDot3" Width="24" Height="24" CornerRadius="12" Background="#1A1E28"><TextBlock Text="4" Foreground="{StaticResource Muted}" HorizontalAlignment="Center" VerticalAlignment="Center" FontWeight="Bold"/></Border><TextBlock Text="Review" Margin="12,2,0,0" Foreground="{StaticResource Muted}" FontWeight="SemiBold"/></StackPanel>
        </Border>

        <Border Background="#07090D" BorderBrush="#202530" BorderThickness="1" CornerRadius="16" Padding="15" Margin="0,26,0,0">
          <StackPanel>
            <TextBlock Text="YOUR DATA STAYS PUT" FontSize="10" FontWeight="Bold" Foreground="#8DA8F8"/>
            <TextBlock Text="Setup backs up and merges settings. It never clears profiles, galleries, folders, or generations." TextWrapping="Wrap" Foreground="{StaticResource Muted}" FontSize="12" LineHeight="18" Margin="0,9,0,0"/>
          </StackPanel>
        </Border>
      </StackPanel>

      <Border Grid.Column="2" Background="{StaticResource Surface}" BorderBrush="#1E222C" BorderThickness="1" CornerRadius="22" Padding="34">
        <Grid x:Name="PageHost" ClipToBounds="True">
          <Grid x:Name="PageWelcome">
            <StackPanel VerticalAlignment="Center" MaxWidth="610">
              <TextBlock Text="Build your local studio" FontSize="34" FontWeight="Bold"/>
              <TextBlock Text="A portable MixBox Studio connected to the ComfyUI and models already on your machine." TextWrapping="Wrap" FontSize="16" Foreground="{StaticResource Soft}" Margin="0,12,0,28" LineHeight="24"/>
              <Grid>
                <Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="12"/><ColumnDefinition/></Grid.ColumnDefinitions>
                <Border Grid.Column="0" Background="#07090D" BorderBrush="#232936" BorderThickness="1" CornerRadius="16" Padding="18">
                  <StackPanel><TextBlock Text="↻" FontSize="22" Foreground="#7EA2FF"/><TextBlock Text="Updates stay simple" FontWeight="SemiBold" FontSize="15" Margin="0,10,0,0"/><TextBlock Text="Pull new versions from Git without replacing your local data." TextWrapping="Wrap" Foreground="{StaticResource Muted}" FontSize="12" Margin="0,7,0,0" LineHeight="18"/></StackPanel>
                </Border>
                <Border Grid.Column="2" Background="#07090D" BorderBrush="#232936" BorderThickness="1" CornerRadius="16" Padding="18">
                  <StackPanel><TextBlock Text="◇" FontSize="22" Foreground="#A88CFF"/><TextBlock Text="Reuse your setup" FontWeight="SemiBold" FontSize="15" Margin="0,10,0,0"/><TextBlock Text="Keep ComfyUI and large model files exactly where they are." TextWrapping="Wrap" Foreground="{StaticResource Muted}" FontSize="12" Margin="0,7,0,0" LineHeight="18"/></StackPanel>
                </Border>
              </Grid>
              <Border Background="#05070A" BorderBrush="#202530" BorderThickness="1" CornerRadius="15" Padding="17" Margin="0,18,0,0">
                <Grid><Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel><TextBlock Text="Portable checkout" FontWeight="SemiBold"/><TextBlock x:Name="PrereqDetail" Text="Checking Git and Node.js…" Foreground="{StaticResource Muted}" FontSize="12" Margin="0,5,0,0"/></StackPanel><Border x:Name="PrereqBadge" Grid.Column="1" Background="#172030" CornerRadius="10" Padding="12,7" VerticalAlignment="Center"><TextBlock x:Name="PrereqText" Text="CHECKING" FontSize="10" FontWeight="Bold" Foreground="#9BB4F8"/></Border></Grid>
              </Border>
            </StackPanel>
          </Grid>

          <Grid x:Name="PageConnection" Visibility="Collapsed">
            <ScrollViewer VerticalScrollBarVisibility="Auto">
              <StackPanel MaxWidth="650">
                <TextBlock Text="Connect ComfyUI" FontSize="30" FontWeight="Bold"/>
                <TextBlock Text="Point MixBox Studio at the ComfyUI installation that performs generation." Foreground="{StaticResource Soft}" FontSize="15" Margin="0,9,0,25"/>
                <TextBlock Text="COMFYUI URL" Foreground="{StaticResource Muted}" FontSize="11" FontWeight="Bold"/>
                <Grid Margin="0,8,0,18"><Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="10"/><ColumnDefinition Width="118"/></Grid.ColumnDefinitions><TextBox x:Name="ComfyUrlBox" Text="http://127.0.0.1:8188"/><Button x:Name="TestComfyButton" Grid.Column="2" Style="{StaticResource BaseButton}" Content="Test connection" Padding="12,10"/></Grid>
                <Border x:Name="ConnectionStatus" Visibility="Collapsed" Background="#0C1116" BorderBrush="#273342" BorderThickness="1" CornerRadius="12" Padding="13" Margin="0,0,0,18"><TextBlock x:Name="ConnectionStatusText" TextWrapping="Wrap"/></Border>
                <TextBlock Text="COMFYUI FOLDER" Foreground="{StaticResource Muted}" FontSize="11" FontWeight="Bold"/>
                <Grid Margin="0,8,0,6"><Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="10"/><ColumnDefinition Width="90"/></Grid.ColumnDefinitions><TextBox x:Name="ComfyPathBox"/><Button x:Name="BrowseComfyButton" Grid.Column="2" Style="{StaticResource BaseButton}" Content="Browse" Padding="12,10"/></Grid>
                <TextBlock Text="Optional. Used to discover models and local metadata." Foreground="{StaticResource Muted}" FontSize="11" Margin="2,0,0,17"/>
                <TextBlock Text="MODELS FOLDER" Foreground="{StaticResource Muted}" FontSize="11" FontWeight="Bold"/>
                <Grid Margin="0,8,0,6"><Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="10"/><ColumnDefinition Width="90"/></Grid.ColumnDefinitions><TextBox x:Name="ModelsPathBox"/><Button x:Name="BrowseModelsButton" Grid.Column="2" Style="{StaticResource BaseButton}" Content="Browse" Padding="12,10"/></Grid>
                <TextBlock Text="No files are moved or duplicated. ComfyUI must already be configured to see this folder." Foreground="{StaticResource Muted}" FontSize="11" Margin="2,0,0,0"/>
              </StackPanel>
            </ScrollViewer>
          </Grid>

          <Grid x:Name="PageFeatures" Visibility="Collapsed">
            <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/></Grid.RowDefinitions>
            <StackPanel><TextBlock Text="Choose your tools" FontSize="30" FontWeight="Bold"/><TextBlock Text="Only show model families you plan to use. You can rerun setup later." Foreground="{StaticResource Soft}" FontSize="15" Margin="0,9,0,22"/></StackPanel>
            <ScrollViewer Grid.Row="1" VerticalScrollBarVisibility="Auto" Padding="0,0,8,0"><StackPanel x:Name="FeatureList"/></ScrollViewer>
          </Grid>

          <Grid x:Name="PageReview" Visibility="Collapsed">
            <StackPanel MaxWidth="650" VerticalAlignment="Center">
              <TextBlock Text="Ready to set up" FontSize="30" FontWeight="Bold"/>
              <TextBlock Text="Review the connection and feature choices before anything is written." Foreground="{StaticResource Soft}" FontSize="15" Margin="0,9,0,24"/>
              <Border Background="#05070A" BorderBrush="#232936" BorderThickness="1" CornerRadius="17" Padding="20">
                <StackPanel>
                  <Grid Margin="0,0,0,15"><Grid.ColumnDefinitions><ColumnDefinition Width="145"/><ColumnDefinition/></Grid.ColumnDefinitions><TextBlock Text="ComfyUI" Foreground="{StaticResource Muted}"/><TextBlock x:Name="ReviewUrl" Grid.Column="1" TextWrapping="Wrap" FontWeight="SemiBold"/></Grid>
                  <Border Height="1" Background="#1E222C" Margin="0,0,0,15"/>
                  <Grid Margin="0,0,0,15"><Grid.ColumnDefinitions><ColumnDefinition Width="145"/><ColumnDefinition/></Grid.ColumnDefinitions><TextBlock Text="Models" Foreground="{StaticResource Muted}"/><TextBlock x:Name="ReviewModels" Grid.Column="1" TextWrapping="Wrap" FontWeight="SemiBold"/></Grid>
                  <Border Height="1" Background="#1E222C" Margin="0,0,0,15"/>
                  <Grid><Grid.ColumnDefinitions><ColumnDefinition Width="145"/><ColumnDefinition/></Grid.ColumnDefinitions><TextBlock Text="Enabled tools" Foreground="{StaticResource Muted}"/><TextBlock x:Name="ReviewFeatures" Grid.Column="1" TextWrapping="Wrap" FontWeight="SemiBold"/></Grid>
                </StackPanel>
              </Border>
              <Border Background="#09100C" BorderBrush="#20382A" BorderThickness="1" CornerRadius="14" Padding="15" Margin="0,16,0,0"><TextBlock Text="✓ Existing settings are backed up and merged. Gallery data is never replaced." Foreground="#9FD8AE" TextWrapping="Wrap"/></Border>
            </StackPanel>
          </Grid>

          <Grid x:Name="PageProgress" Visibility="Collapsed">
            <StackPanel MaxWidth="610" VerticalAlignment="Center" HorizontalAlignment="Center">
              <Border Width="76" Height="76" CornerRadius="24" BorderBrush="{StaticResource Spectrum}" BorderThickness="2" Background="#0B0E15"><TextBlock Text="↻" FontSize="34" HorizontalAlignment="Center" VerticalAlignment="Center" Foreground="#A9BDF6"/></Border>
              <TextBlock Text="Setting up MixBox Studio" FontSize="28" FontWeight="Bold" HorizontalAlignment="Center" Margin="0,22,0,8"/>
              <TextBlock x:Name="ProgressDetail" Text="Preparing your portable configuration…" Foreground="{StaticResource Muted}" HorizontalAlignment="Center"/>
              <ProgressBar x:Name="InstallProgress" Height="5" IsIndeterminate="True" Margin="0,26,0,0" Background="#151923" Foreground="#526FFF"/>
            </StackPanel>
          </Grid>

          <Grid x:Name="PageComplete" Visibility="Collapsed">
            <StackPanel MaxWidth="610" VerticalAlignment="Center" HorizontalAlignment="Center">
              <Border Width="76" Height="76" CornerRadius="24" Background="#0B1710" BorderBrush="#315D3C" BorderThickness="1"><TextBlock Text="✓" FontSize="34" HorizontalAlignment="Center" VerticalAlignment="Center" Foreground="#7DDF95"/></Border>
              <TextBlock Text="Your studio is ready" FontSize="30" FontWeight="Bold" HorizontalAlignment="Center" Margin="0,22,0,8"/>
              <TextBlock Text="Start ComfyUI, then open MixBox Studio from this portable folder." Foreground="{StaticResource Soft}" TextAlignment="Center" TextWrapping="Wrap" FontSize="15"/>
              <Button x:Name="LaunchButton" Style="{StaticResource PrimaryButton}" Content="Launch MixBox Studio" Margin="0,28,0,0" MinWidth="240"/>
              <TextBlock Text="Your first profile is created inside the app." Foreground="{StaticResource Muted}" HorizontalAlignment="Center" FontSize="12" Margin="0,14,0,0"/>
            </StackPanel>
          </Grid>

          <Grid x:Name="PageError" Visibility="Collapsed">
            <StackPanel MaxWidth="620" VerticalAlignment="Center">
              <TextBlock Text="Setup needs attention" FontSize="30" FontWeight="Bold"/>
              <TextBlock x:Name="ErrorText" TextWrapping="Wrap" Foreground="#F0A8A8" Margin="0,14,0,20" LineHeight="22"/>
              <Button x:Name="RetryButton" Style="{StaticResource BaseButton}" Content="Back to review" HorizontalAlignment="Left"/>
            </StackPanel>
          </Grid>
        </Grid>
      </Border>
    </Grid>

    <Border Grid.Row="2" Background="#020203" BorderBrush="#171A22" BorderThickness="0,1,0,0" Padding="26,15">
      <Grid><Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="Auto"/><ColumnDefinition Width="10"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><TextBlock x:Name="FooterHint" Text="Portable setup · nothing is installed system-wide" Foreground="{StaticResource Muted}" VerticalAlignment="Center" FontSize="12"/><Button x:Name="BackButton" Grid.Column="1" Style="{StaticResource BaseButton}" Content="Back" IsEnabled="False" MinWidth="104"/><Button x:Name="NextButton" Grid.Column="3" Style="{StaticResource PrimaryButton}" Content="Continue" MinWidth="138"/></Grid>
    </Border>
  </Grid>
</Window>
'@

$Reader = New-Object System.Xml.XmlNodeReader $Xaml
$Window = [Windows.Markup.XamlReader]::Load($Reader)

function Ui([string]$Name) { return $Window.FindName($Name) }

$Pages = @('PageWelcome', 'PageConnection', 'PageFeatures', 'PageReview', 'PageProgress', 'PageComplete', 'PageError')
$CurrentPage = 0
$FeatureToggles = @{}
$FeatureLabels = @{}

function Read-JsonSafe([string]$Path) {
  if (-not (Test-Path $Path)) { return [pscustomobject]@{} }
  try { return Get-Content $Path -Raw | ConvertFrom-Json } catch { return [pscustomobject]@{} }
}

function Property-Or($Object, [string]$Name, $Fallback) {
  if ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]) { return $Object.PSObject.Properties[$Name].Value }
  return $Fallback
}

function Animate-Page([System.Windows.FrameworkElement]$Page) {
  $Page.Opacity = 0
  $Transform = New-Object System.Windows.Media.TranslateTransform
  $Transform.Y = 12
  $Page.RenderTransform = $Transform
  $Ease = New-Object System.Windows.Media.Animation.CubicEase
  $Ease.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut
  $Fade = New-Object System.Windows.Media.Animation.DoubleAnimation(0, 1, [TimeSpan]::FromMilliseconds(220))
  $Fade.EasingFunction = $Ease
  $Slide = New-Object System.Windows.Media.Animation.DoubleAnimation(12, 0, [TimeSpan]::FromMilliseconds(260))
  $Slide.EasingFunction = $Ease
  $Page.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $Fade)
  $Transform.BeginAnimation([System.Windows.Media.TranslateTransform]::YProperty, $Slide)
}

function Set-StepState([int]$Index) {
  for ($i = 0; $i -lt 4; $i++) {
    $Step = Ui "Step$i"
    $Dot = Ui "StepDot$i"
    $Label = $Step.Child.Children[1]
    $Number = $Dot.Child
    if ($i -eq $Index) {
      $Step.Background = [Windows.Media.BrushConverter]::new().ConvertFromString('#151925')
      $Dot.Background = [Windows.Media.BrushConverter]::new().ConvertFromString('#4257FF')
      $Label.Foreground = [Windows.Media.Brushes]::White
      $Number.Foreground = [Windows.Media.Brushes]::White
    } elseif ($i -lt $Index) {
      $Step.Background = [Windows.Media.Brushes]::Transparent
      $Dot.Background = [Windows.Media.BrushConverter]::new().ConvertFromString('#18301F')
      $Label.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#B9C4D9')
      $Number.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#7DDF95')
    } else {
      $Step.Background = [Windows.Media.Brushes]::Transparent
      $Dot.Background = [Windows.Media.BrushConverter]::new().ConvertFromString('#1A1E28')
      $Label.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#8E99B7')
      $Number.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#8E99B7')
    }
  }
}

function Show-Page([int]$Index) {
  for ($i = 0; $i -lt $Pages.Count; $i++) { (Ui $Pages[$i]).Visibility = if ($i -eq $Index) { 'Visible' } else { 'Collapsed' } }
  if ($Index -lt 4) {
    $CurrentPage = $Index
    Set-StepState $Index
    (Ui 'BackButton').IsEnabled = $Index -gt 0
    (Ui 'BackButton').Visibility = 'Visible'
    (Ui 'NextButton').Visibility = 'Visible'
    (Ui 'NextButton').Content = if ($Index -eq 3) { 'Install' } else { 'Continue' }
    (Ui 'FooterHint').Visibility = 'Visible'
  } else {
    (Ui 'BackButton').Visibility = 'Collapsed'
    (Ui 'NextButton').Visibility = 'Collapsed'
    (Ui 'FooterHint').Visibility = 'Collapsed'
  }
  Animate-Page (Ui $Pages[$Index])
}

function Select-Folder([string]$Description, [string]$Current) {
  $Dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $Dialog.Description = $Description
  $Dialog.ShowNewFolderButton = $false
  if ($Current -and (Test-Path $Current)) { $Dialog.SelectedPath = $Current }
  if ($Dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $Dialog.SelectedPath }
  return $Current
}

function Quote-Argument([string]$Value) {
  if ($null -eq $Value) { return '""' }
  return '"' + $Value.Replace('"', '\"') + '"'
}

function Update-Review {
  (Ui 'ReviewUrl').Text = (Ui 'ComfyUrlBox').Text.Trim()
  $Models = (Ui 'ModelsPathBox').Text.Trim()
  (Ui 'ReviewModels').Text = if ($Models) { $Models } else { 'Use the connected ComfyUI model paths' }
  $Enabled = @()
  foreach ($Id in $FeatureToggles.Keys) { if ($FeatureToggles[$Id].IsChecked) { $Enabled += $FeatureLabels[$Id] } }
  (Ui 'ReviewFeatures').Text = if ($Enabled.Count) { $Enabled -join ', ' } else { 'Core image generation only' }
}

function Write-FeatureSelection {
  $Selection = [ordered]@{}
  foreach ($Id in $FeatureToggles.Keys) { $Selection[$Id] = [bool]$FeatureToggles[$Id].IsChecked }
  $Path = Join-Path $env:TEMP ("mixbox-features-" + [Guid]::NewGuid().ToString('N') + '.json')
  [IO.File]::WriteAllText($Path, ($Selection | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
  return $Path
}

function Begin-Install {
  Show-Page 4
  $FeatureFile = Write-FeatureSelection
  $Url = (Ui 'ComfyUrlBox').Text.Trim()
  $Comfy = (Ui 'ComfyPathBox').Text.Trim()
  $Models = (Ui 'ModelsPathBox').Text.Trim()
  $EngineArguments = '-NoProfile -ExecutionPolicy Bypass -File ' + (Quote-Argument $EngineFile) +
    ' -NonInteractive -SkipLaunch -ComfyUrl ' + (Quote-Argument $Url) +
    ' -ComfyPath ' + (Quote-Argument $Comfy) +
    ' -ModelsPath ' + (Quote-Argument $Models) +
    ' -FeatureConfigFile ' + (Quote-Argument $FeatureFile)
  $Work = [pscustomobject]@{
    EngineArguments = $EngineArguments
    FeatureFile = $FeatureFile
  }

  $Worker = New-Object System.ComponentModel.BackgroundWorker
  $Worker.add_DoWork({
    param($Sender, $Event)
    $WorkItem = $Event.Argument
    $Info = New-Object System.Diagnostics.ProcessStartInfo
    $Info.FileName = 'powershell.exe'
    $Info.Arguments = $WorkItem.EngineArguments
    $Info.UseShellExecute = $false
    $Info.CreateNoWindow = $true
    $Info.RedirectStandardOutput = $true
    $Info.RedirectStandardError = $true
    $Process = New-Object System.Diagnostics.Process
    $Process.StartInfo = $Info
    [void]$Process.Start()
    $Output = $Process.StandardOutput.ReadToEnd()
    $ErrorOutput = $Process.StandardError.ReadToEnd()
    $Process.WaitForExit()
    $Event.Result = [pscustomobject]@{ ExitCode = $Process.ExitCode; Output = $Output; Error = $ErrorOutput; FeatureFile = $WorkItem.FeatureFile }
  })
  $Worker.add_RunWorkerCompleted({
    param($Sender, $Event)
    if ($null -ne $Event.Error) {
      (Ui 'ErrorText').Text = $Event.Error.Message
      Show-Page 6
      return
    }
    $Result = $Event.Result
    if ($Result.FeatureFile -and (Test-Path $Result.FeatureFile)) { Remove-Item $Result.FeatureFile -Force -ErrorAction SilentlyContinue }
    if ($Result.ExitCode -eq 0) {
      Show-Page 5
    } else {
      $Message = ($Result.Error + "`n" + $Result.Output).Trim()
      (Ui 'ErrorText').Text = if ($Message) { $Message } else { 'Setup stopped before configuration was saved.' }
      Show-Page 6
    }
  })
  $Worker.RunWorkerAsync($Work)
}

function Test-ComfyConnection {
  $Status = Ui 'ConnectionStatus'
  $Text = Ui 'ConnectionStatusText'
  $Status.Visibility = 'Visible'
  $Text.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#B8C5DC')
  $Text.Text = 'Checking the ComfyUI API…'
  $Window.Dispatcher.Invoke([action]{}, [Windows.Threading.DispatcherPriority]::Background)
  try {
    $Url = (Ui 'ComfyUrlBox').Text.Trim().TrimEnd('/') + '/object_info'
    $Request = [Net.WebRequest]::Create($Url)
    $Request.Timeout = 4500
    $Response = $Request.GetResponse()
    $Response.Close()
    $Status.BorderBrush = [Windows.Media.BrushConverter]::new().ConvertFromString('#315D3C')
    $Text.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#9FD8AE')
    $Text.Text = 'Connected. ComfyUI is ready to answer MixBox Studio.'
  } catch {
    $Status.BorderBrush = [Windows.Media.BrushConverter]::new().ConvertFromString('#704141')
    $Text.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#F0A8A8')
    $Text.Text = 'Not reachable yet. You can continue and start ComfyUI later.'
  }
}

# Restore current machine values without modifying anything.
$Settings = Read-JsonSafe $SettingsFile
$Install = Read-JsonSafe $InstallFile
$ComfyConfig = Property-Or $Install 'comfy' ([pscustomobject]@{})
(Ui 'ComfyUrlBox').Text = [string](Property-Or $Settings 'comfyUrl' 'http://127.0.0.1:8188')
(Ui 'ComfyPathBox').Text = [string](Property-Or $ComfyConfig 'path' '')
(Ui 'ModelsPathBox').Text = [string](Property-Or $ComfyConfig 'modelsPath' '')

$SavedFeatures = Property-Or $Settings 'features' ([pscustomobject]@{})
if (Test-Path $ManifestFile) {
  $Manifest = Get-Content $ManifestFile -Raw | ConvertFrom-Json
  $CurrentGroup = ''
  foreach ($Feature in $Manifest.features) {
    if ($Feature.required -eq $true) { continue }
    $Group = ([string]$Feature.id).Split('.')[0].ToUpperInvariant()
    if ($Group -ne $CurrentGroup) {
      $Heading = New-Object Windows.Controls.TextBlock
      $Heading.Text = $Group
      $Heading.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#8E99B7')
      $Heading.FontSize = 11
      $Heading.FontWeight = 'Bold'
      $Heading.Margin = '2,6,0,10'
      (Ui 'FeatureList').Children.Add($Heading) | Out-Null
      $CurrentGroup = $Group
    }
    $Toggle = New-Object Windows.Controls.Primitives.ToggleButton
    $Toggle.Style = $Window.Resources['FeatureToggle']
    $Toggle.IsChecked = [bool](Property-Or $SavedFeatures ([string]$Feature.id) ([bool]$Feature.default))
    $Copy = New-Object Windows.Controls.StackPanel
    $Title = New-Object Windows.Controls.TextBlock
    $Title.Text = [string]$Feature.label
    $Title.FontWeight = 'SemiBold'
    $Title.FontSize = 14
    $Sub = New-Object Windows.Controls.TextBlock
    $Sub.Text = if ($Feature.models.Count -eq 1) { '1 model component' } else { "$($Feature.models.Count) model components" }
    $Sub.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#8E99B7')
    $Sub.FontSize = 11
    $Sub.Margin = '0,4,0,0'
    $Copy.Children.Add($Title) | Out-Null
    $Copy.Children.Add($Sub) | Out-Null
    $Toggle.Content = $Copy
    (Ui 'FeatureList').Children.Add($Toggle) | Out-Null
    $FeatureToggles[[string]$Feature.id] = $Toggle
    $FeatureLabels[[string]$Feature.id] = [string]$Feature.label
  }
}

# Prerequisite summary is read-only; the engine performs the authoritative check.
$HasGitCheckout = Test-Path (Join-Path $Root '.git')
$GitCommand = Get-Command git -ErrorAction SilentlyContinue
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
$NodeMajor = 0
if ($NodeCommand) {
  $Version = (& node --version 2>$null).Trim()
  if ($Version -match '^v(\d+)') { $NodeMajor = [int]$Matches[1] }
}
if ($HasGitCheckout -and $GitCommand -and $NodeMajor -ge 22) {
  (Ui 'PrereqDetail').Text = "Git checkout found · Node $Version"
  (Ui 'PrereqText').Text = 'READY'
  (Ui 'PrereqBadge').Background = [Windows.Media.BrushConverter]::new().ConvertFromString('#15301D')
  (Ui 'PrereqText').Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#7DDF95')
} else {
  $Missing = @()
  if (-not $HasGitCheckout) { $Missing += 'Git clone' }
  if (-not $GitCommand) { $Missing += 'Git for Windows' }
  if ($NodeMajor -lt 22) { $Missing += 'Node.js 22+' }
  (Ui 'PrereqDetail').Text = 'Setup will check: ' + ($Missing -join ', ')
  (Ui 'PrereqText').Text = 'ACTION NEEDED'
  (Ui 'PrereqBadge').Background = [Windows.Media.BrushConverter]::new().ConvertFromString('#332613')
  (Ui 'PrereqText').Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#F4C66B')
}

(Ui 'CloseButton').Add_Click({ $Window.Close() })
(Ui 'BackButton').Add_Click({ if ($CurrentPage -gt 0) { Show-Page ($CurrentPage - 1) } })
(Ui 'NextButton').Add_Click({
  if ($CurrentPage -eq 0) { Show-Page 1; return }
  if ($CurrentPage -eq 1) {
    $Url = (Ui 'ComfyUrlBox').Text.Trim()
    if ($Url -notmatch '^https?://') {
      (Ui 'ConnectionStatus').Visibility = 'Visible'
      (Ui 'ConnectionStatusText').Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#F0A8A8')
      (Ui 'ConnectionStatusText').Text = 'Enter a full ComfyUI URL beginning with http:// or https://.'
      return
    }
    Show-Page 2
    return
  }
  if ($CurrentPage -eq 2) { Update-Review; Show-Page 3; return }
  if ($CurrentPage -eq 3) { Begin-Install; return }
})
(Ui 'TestComfyButton').Add_Click({ Test-ComfyConnection })
(Ui 'BrowseComfyButton').Add_Click({
  $Chosen = Select-Folder 'Select the existing ComfyUI folder' (Ui 'ComfyPathBox').Text
  (Ui 'ComfyPathBox').Text = $Chosen
  if ($Chosen -and -not (Ui 'ModelsPathBox').Text.Trim()) { (Ui 'ModelsPathBox').Text = Join-Path $Chosen 'models' }
})
(Ui 'BrowseModelsButton').Add_Click({ (Ui 'ModelsPathBox').Text = Select-Folder 'Select the models folder used by ComfyUI' (Ui 'ModelsPathBox').Text })
(Ui 'RetryButton').Add_Click({ Update-Review; Show-Page 3 })
(Ui 'LaunchButton').Add_Click({
  Start-Process (Join-Path $Root 'start.bat') -WorkingDirectory $Root
  $Window.Close()
})

Show-Page 0
[void]$Window.ShowDialog()
