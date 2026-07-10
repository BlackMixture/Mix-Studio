$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms

trap {
  [System.Windows.MessageBox]::Show(
    "Mix Studio Setup could not open.`n`n$($_.Exception.Message)",
    'Mix Studio Setup',
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
        Title="Mix Studio Setup" Width="980" Height="720" MinWidth="860" MinHeight="640"
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

    <Style TargetType="PasswordBox">
      <Setter Property="Foreground" Value="#F6F8FF"/>
      <Setter Property="Background" Value="#050609"/>
      <Setter Property="BorderBrush" Value="#252A36"/>
      <Setter Property="BorderThickness" Value="1"/>
      <Setter Property="Padding" Value="14,11"/>
      <Setter Property="FontSize" Value="14"/>
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
              <Canvas Width="734.42" Height="753.63">
                <Path Fill="#fdc302" Data="M615.65 208.12c-15.14-3.45-30.62-1.14-44.15 7.05L366.77 339.12l-82.59-50.59-121.3-73.24c-13.51-8.16-29.27-10.69-44.22-7.24l-.38-36.63c-.19-18.31 7.8-38.19 24.31-47.95L339 7.31c16.59-9.81 38.81-9.68 55.26-.02l190.82 111.96c18.08 10.61 30.68 27.5 30.64 49.47l-.08 39.4Z"/>
                <Path Fill="#47ad49" Data="m366.77 339.12.09.87-48.9 31.04-59.13 36.83c-12.32 7.67-19 19.03-23.8 32.13-2.52-1.15-4.65-2.62-7.36-4.35l-80.77-51.51c-17.97-11.46-28.62-29-28.66-50.54L118 208.69l.66-.64c14.95-3.45 30.71-.92 44.22 7.24l121.3 73.24 82.59 50.59Z"/>
                <Path Fill="#432dd0" Data="m332.59 501.15 34.33 21.71-.18 179.91.13.97c-.22-.13-.57 0-.81-.09-35.73-24.32-73.67-45.47-110.31-69.84-13.42-8.92-21.64-25.24-21.67-41.48l-.32-137.55c-.01-4.96.41-9.12 1.4-13.36.91.05 1.9.37 2.9.98l22.1 13.57 72.44 45.17Z"/>
                <Path Fill="#564aa7" Data="m366.92 522.86-34.33-21.71-72.44-45.17-22.1-13.57c-1-.61-1.99-.93-2.9-.98.1-.43-.28-1.02-.12-1.44 4.81-13.1 11.49-24.46 23.8-32.13l59.13-36.83 48.91-31.04.05 182.87Z"/>
                <Path Fill="#822292" Data="M499.44 441.41c.94 2.58 1.52 5.3 1.51 8.73l-.21 142.47c-.03 18.67-10.55 34.44-25.85 43.95l-104.6 65.01c-1.35.84-2.57.73-3.55 1.2l.18-179.91 92.76-57.37 31.62-19.69c2.77-1.72 5.25-3.57 8.15-4.39Z"/>
                <Path Fill="#973975" Data="M499.54 440.09c.11.4-.16.91-.1 1.32-2.9.82-5.39 2.67-8.15 4.39l-31.62 19.69-92.76 57.37-.05-182.87c1.98.17 3.37 1.31 5.38 2.56l104.15 65.36c11.88 7.46 19.61 19.04 23.15 32.17Z"/>
                <Path Fill="#026cfc" Data="m118 208.7.24 124.9c.04 21.54 10.69 39.08 28.66 50.54l80.77 51.51c2.71 1.73 4.84 3.2 7.36 4.35-.15.42.22 1.01.12 1.44-.98 4.23-1.41 8.4-1.4 13.36l.32 137.55c.04 16.25 8.25 32.56 21.67 41.48 36.65 24.36 74.58 45.52 110.31 69.84l-71.48 42.61c-16.45 9.81-39.02 9.86-55.74-.07L28.62 621.52C12.66 612.05.29 594.24.27 574.83L0 304.32c-.02-17.99 9.59-35.35 24.74-44.31l74.56-44.12c6.08-3.6 12.06-6.74 18.7-7.2Z"/>
                <Path Fill="#fb2026" Data="M734.42 308.79c-.63-.38-1.3-.07-1.56 1.06V576.2c.21.86.39 1.09.83 1-1.39 17.82-11.84 34.61-27.56 44.06L501.5 744.21c-20.46 12.29-44.38 11.76-65.01-.17l-69.63-40.28-.13-.97c.98-.46 2.21-.36 3.55-1.2l104.6-65.01c15.3-9.51 25.83-25.28 25.85-43.95l.21-142.47c0-3.43-.57-6.15-1.51-8.73-.06-.41.21-.92.1-1.32 1.1-.15 1.99-.65 3.27-1.49l90.13-58.72c13.61-8.87 22.36-24.62 22.4-40.8l.31-130.96c6.52 1.49 12.24 3.64 18.42 7.3l77.83 46.13c16.79 9.95 22.53 29.12 22.52 47.24Z"/>
                <Path Fill="#fa0f17" Data="m734.42 308.79-.04 263.53c0 2.07-.58 3.41-.69 4.88-.44.1-.62-.13-.83-1V309.85c.25-1.13.92-1.44 1.55-1.06Z"/>
                <Path Fill="#fc6f01" Data="m615.65 208.12-.31 130.96c-.04 16.18-8.79 31.93-22.4 40.8l-90.13 58.72c-1.28.83-2.17 1.33-3.27 1.49-3.54-13.13-11.27-24.71-23.15-32.17l-104.15-65.36c-2-1.26-3.4-2.39-5.38-2.56l-.09-.87L571.5 215.18c13.53-8.19 29.02-10.5 44.15-7.05Z"/>
              </Canvas>
            </Viewbox>
          </Border>
          <StackPanel Margin="14,0,0,0" VerticalAlignment="Center">
            <TextBlock Text="Mix Studio" FontSize="20" FontWeight="Bold"/>
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
              <TextBlock Text="Set up a complete local studio, or connect Mix Studio to the ComfyUI and models already on your machine." TextWrapping="Wrap" FontSize="16" Foreground="{StaticResource Soft}" Margin="0,12,0,28" LineHeight="24"/>
              <Grid>
                <Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="12"/><ColumnDefinition/></Grid.ColumnDefinitions>
                <Border Grid.Column="0" Background="#07090D" BorderBrush="#232936" BorderThickness="1" CornerRadius="16" Padding="18">
                  <StackPanel><TextBlock Text="↻" FontSize="22" Foreground="#7EA2FF"/><TextBlock Text="Updates and restarts" FontWeight="SemiBold" FontSize="15" Margin="0,10,0,0"/><TextBlock Text="Pull new versions or restart from the app menu when both queues are idle." TextWrapping="Wrap" Foreground="{StaticResource Muted}" FontSize="12" Margin="0,7,0,0" LineHeight="18"/></StackPanel>
                </Border>
                <Border Grid.Column="2" Background="#07090D" BorderBrush="#232936" BorderThickness="1" CornerRadius="16" Padding="18">
                  <StackPanel><TextBlock Text="◇" FontSize="22" Foreground="#A88CFF"/><TextBlock Text="Guided dependencies" FontWeight="SemiBold" FontSize="15" Margin="0,10,0,0"/><TextBlock Text="Choose model families and let setup place approved models and nodes correctly." TextWrapping="Wrap" Foreground="{StaticResource Muted}" FontSize="12" Margin="0,7,0,0" LineHeight="18"/></StackPanel>
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
                <TextBlock Text="Set up ComfyUI" FontSize="30" FontWeight="Bold"/>
                <TextBlock Text="Install the official Windows desktop app, or reuse an installation already on this machine." Foreground="{StaticResource Soft}" FontSize="15" Margin="0,9,0,20" TextWrapping="Wrap"/>
                <Border Background="#07090D" BorderBrush="#252A36" BorderThickness="1" CornerRadius="14" Padding="15" Margin="0,0,0,10">
                  <RadioButton x:Name="InstallComfyOption" GroupName="ComfyMode" IsChecked="True" Foreground="#F6F8FF">
                    <StackPanel Margin="7,0,0,0"><TextBlock Text="Install ComfyUI Desktop" FontWeight="SemiBold"/><TextBlock Text="Download the signed official NVIDIA installer and guide me through initialization." Foreground="{StaticResource Muted}" FontSize="11" Margin="0,4,0,0" TextWrapping="Wrap"/></StackPanel>
                  </RadioButton>
                </Border>
                <Border Background="#07090D" BorderBrush="#252A36" BorderThickness="1" CornerRadius="14" Padding="15" Margin="0,0,0,20">
                  <RadioButton x:Name="ExistingComfyOption" GroupName="ComfyMode" Foreground="#F6F8FF">
                    <StackPanel Margin="7,0,0,0"><TextBlock Text="Use existing ComfyUI" FontWeight="SemiBold"/><TextBlock Text="Keep the current environment and install only selected missing components." Foreground="{StaticResource Muted}" FontSize="11" Margin="0,4,0,0" TextWrapping="Wrap"/></StackPanel>
                  </RadioButton>
                </Border>
                <TextBlock Text="COMFYUI URL" Foreground="{StaticResource Muted}" FontSize="11" FontWeight="Bold"/>
                <Grid Margin="0,8,0,18"><Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="10"/><ColumnDefinition Width="118"/></Grid.ColumnDefinitions><TextBox x:Name="ComfyUrlBox" Text="http://127.0.0.1:8188"/><Button x:Name="TestComfyButton" Grid.Column="2" Style="{StaticResource BaseButton}" Content="Test connection" Padding="12,10"/></Grid>
                <Border x:Name="ConnectionStatus" Visibility="Collapsed" Background="#0C1116" BorderBrush="#273342" BorderThickness="1" CornerRadius="12" Padding="13" Margin="0,0,0,18"><TextBlock x:Name="ConnectionStatusText" TextWrapping="Wrap"/></Border>
                <TextBlock Text="COMFYUI FOLDER" Foreground="{StaticResource Muted}" FontSize="11" FontWeight="Bold"/>
                <Grid Margin="0,8,0,6"><Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="10"/><ColumnDefinition Width="90"/></Grid.ColumnDefinitions><TextBox x:Name="ComfyPathBox"/><Button x:Name="BrowseComfyButton" Grid.Column="2" Style="{StaticResource BaseButton}" Content="Browse" Padding="12,10"/></Grid>
                <TextBlock Text="For a new Desktop install this is detected automatically after initialization." Foreground="{StaticResource Muted}" FontSize="11" Margin="2,0,0,17"/>
                <TextBlock Text="MODELS FOLDER" Foreground="{StaticResource Muted}" FontSize="11" FontWeight="Bold"/>
                <Grid Margin="0,8,0,6"><Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="10"/><ColumnDefinition Width="90"/></Grid.ColumnDefinitions><TextBox x:Name="ModelsPathBox"/><Button x:Name="BrowseModelsButton" Grid.Column="2" Style="{StaticResource BaseButton}" Content="Browse" Padding="12,10"/></Grid>
                <TextBlock Text="No files are moved or duplicated. ComfyUI must already be configured to see this folder." Foreground="{StaticResource Muted}" FontSize="11" Margin="2,0,0,0"/>
              </StackPanel>
            </ScrollViewer>
          </Grid>

          <Grid x:Name="PageFeatures" Visibility="Collapsed">
            <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="*"/></Grid.RowDefinitions>
            <StackPanel><TextBlock Text="Choose your tools" FontSize="30" FontWeight="Bold"/><TextBlock Text="Core image generation is always included. Optional video and advanced edit families can each add tens of gigabytes; existing files are skipped." Foreground="{StaticResource Soft}" FontSize="15" Margin="0,9,0,18" TextWrapping="Wrap"/></StackPanel>
            <StackPanel Grid.Row="1">
              <ToggleButton x:Name="DownloadModelsToggle" Style="{StaticResource FeatureToggle}" IsChecked="True">
                <StackPanel><TextBlock Text="Download models and custom nodes" FontWeight="SemiBold" FontSize="14"/><TextBlock Text="Install reviewed dependencies for the selected tools after ComfyUI is ready." Foreground="{StaticResource Muted}" FontSize="11" Margin="0,4,0,0"/></StackPanel>
              </ToggleButton>
              <TextBlock Text="HUGGING FACE TOKEN · OPTIONAL" Foreground="{StaticResource Muted}" FontSize="10" FontWeight="Bold" Margin="2,4,0,6"/>
              <PasswordBox x:Name="HfTokenBox" Margin="0,0,0,5"/>
              <TextBlock Text="Used only for this setup session. Some providers require accepting their model license first; the token is never saved." Foreground="{StaticResource Muted}" FontSize="10" TextWrapping="Wrap" Margin="2,0,0,14"/>
            </StackPanel>
            <ScrollViewer Grid.Row="2" VerticalScrollBarVisibility="Auto" Padding="0,0,8,0"><StackPanel x:Name="FeatureList"/></ScrollViewer>
          </Grid>

          <Grid x:Name="PageReview" Visibility="Collapsed">
            <StackPanel MaxWidth="650" VerticalAlignment="Center">
              <TextBlock Text="Ready to set up" FontSize="30" FontWeight="Bold"/>
              <TextBlock Text="Review the connection and feature choices before anything is written." Foreground="{StaticResource Soft}" FontSize="15" Margin="0,9,0,24"/>
              <Border Background="#05070A" BorderBrush="#232936" BorderThickness="1" CornerRadius="17" Padding="20">
                <StackPanel>
                  <Grid Margin="0,0,0,15"><Grid.ColumnDefinitions><ColumnDefinition Width="145"/><ColumnDefinition/></Grid.ColumnDefinitions><TextBlock Text="ComfyUI" Foreground="{StaticResource Muted}"/><TextBlock x:Name="ReviewUrl" Grid.Column="1" TextWrapping="Wrap" FontWeight="SemiBold"/></Grid>
                  <Border Height="1" Background="#1E222C" Margin="0,0,0,15"/>
                  <Grid Margin="0,0,0,15"><Grid.ColumnDefinitions><ColumnDefinition Width="145"/><ColumnDefinition/></Grid.ColumnDefinitions><TextBlock Text="Setup plan" Foreground="{StaticResource Muted}"/><TextBlock x:Name="ReviewComfyMode" Grid.Column="1" TextWrapping="Wrap" FontWeight="SemiBold"/></Grid>
                  <Border Height="1" Background="#1E222C" Margin="0,0,0,15"/>
                  <Grid Margin="0,0,0,15"><Grid.ColumnDefinitions><ColumnDefinition Width="145"/><ColumnDefinition/></Grid.ColumnDefinitions><TextBlock Text="Models" Foreground="{StaticResource Muted}"/><TextBlock x:Name="ReviewModels" Grid.Column="1" TextWrapping="Wrap" FontWeight="SemiBold"/></Grid>
                  <Border Height="1" Background="#1E222C" Margin="0,0,0,15"/>
                  <Grid Margin="0,0,0,15"><Grid.ColumnDefinitions><ColumnDefinition Width="145"/><ColumnDefinition/></Grid.ColumnDefinitions><TextBlock Text="Enabled tools" Foreground="{StaticResource Muted}"/><TextBlock x:Name="ReviewFeatures" Grid.Column="1" TextWrapping="Wrap" FontWeight="SemiBold"/></Grid>
                  <Border Height="1" Background="#1E222C" Margin="0,0,0,15"/>
                  <Grid><Grid.ColumnDefinitions><ColumnDefinition Width="145"/><ColumnDefinition/></Grid.ColumnDefinitions><TextBlock Text="Dependencies" Foreground="{StaticResource Muted}"/><TextBlock x:Name="ReviewDownloads" Grid.Column="1" TextWrapping="Wrap" FontWeight="SemiBold"/></Grid>
                </StackPanel>
              </Border>
              <Border Background="#09100C" BorderBrush="#20382A" BorderThickness="1" CornerRadius="14" Padding="15" Margin="0,16,0,0"><TextBlock Text="✓ Existing settings are backed up and merged. Gallery data is never replaced." Foreground="#9FD8AE" TextWrapping="Wrap"/></Border>
            </StackPanel>
          </Grid>

          <Grid x:Name="PageProgress" Visibility="Collapsed">
            <StackPanel MaxWidth="610" VerticalAlignment="Center" HorizontalAlignment="Center">
              <Border Width="76" Height="76" CornerRadius="24" BorderBrush="{StaticResource Spectrum}" BorderThickness="2" Background="#0B0E15"><TextBlock Text="↻" FontSize="34" HorizontalAlignment="Center" VerticalAlignment="Center" Foreground="#A9BDF6"/></Border>
              <TextBlock Text="Setting up Mix Studio" FontSize="28" FontWeight="Bold" HorizontalAlignment="Center" Margin="0,22,0,8"/>
              <TextBlock x:Name="ProgressDetail" Text="Preparing your portable configuration…" Foreground="{StaticResource Muted}" HorizontalAlignment="Center" TextAlignment="Center" TextWrapping="Wrap" MaxWidth="560"/>
              <ProgressBar x:Name="InstallProgress" Height="5" IsIndeterminate="True" Margin="0,26,0,0" Background="#151923" Foreground="#526FFF"/>
            </StackPanel>
          </Grid>

          <Grid x:Name="PageComplete" Visibility="Collapsed">
            <StackPanel MaxWidth="610" VerticalAlignment="Center" HorizontalAlignment="Center">
              <Border Width="76" Height="76" CornerRadius="24" Background="#0B1710" BorderBrush="#315D3C" BorderThickness="1"><TextBlock Text="✓" FontSize="34" HorizontalAlignment="Center" VerticalAlignment="Center" Foreground="#7DDF95"/></Border>
              <TextBlock Text="Your studio is ready" FontSize="30" FontWeight="Bold" HorizontalAlignment="Center" Margin="0,22,0,8"/>
              <TextBlock Text="ComfyUI, selected dependencies, and Mix Studio are configured. Restart ComfyUI once if new custom nodes were installed." Foreground="{StaticResource Soft}" TextAlignment="Center" TextWrapping="Wrap" FontSize="15"/>
              <Button x:Name="LaunchButton" Style="{StaticResource PrimaryButton}" Content="Launch Mix Studio" Margin="0,28,0,0" MinWidth="240"/>
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
      <Grid><Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="Auto"/><ColumnDefinition Width="10"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><TextBlock x:Name="FooterHint" Text="Guided local setup · existing files are reused" Foreground="{StaticResource Muted}" VerticalAlignment="Center" FontSize="12"/><Button x:Name="BackButton" Grid.Column="1" Style="{StaticResource BaseButton}" Content="Back" IsEnabled="False" MinWidth="104"/><Button x:Name="NextButton" Grid.Column="3" Style="{StaticResource PrimaryButton}" Content="Continue" MinWidth="138"/></Grid>
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
  (Ui 'ReviewComfyMode').Text = if ((Ui 'InstallComfyOption').IsChecked) { 'Install official ComfyUI Desktop for NVIDIA' } else { 'Reuse the existing ComfyUI environment' }
  $Models = (Ui 'ModelsPathBox').Text.Trim()
  (Ui 'ReviewModels').Text = if ($Models) { $Models } elseif ((Ui 'InstallComfyOption').IsChecked) { 'Use the model folder selected during ComfyUI initialization' } else { 'Use the connected ComfyUI model paths' }
  $Enabled = @()
  foreach ($Id in $FeatureToggles.Keys) { if ($FeatureToggles[$Id].IsChecked) { $Enabled += $FeatureLabels[$Id] } }
  (Ui 'ReviewFeatures').Text = if ($Enabled.Count) { $Enabled -join ', ' } else { 'Core image generation only' }
  (Ui 'ReviewDownloads').Text = if ((Ui 'DownloadModelsToggle').IsChecked) { 'Download missing approved models and custom nodes' } else { 'Configure features without downloading dependencies' }
}

function Write-FeatureSelection {
  $Selection = [ordered]@{}
  foreach ($Id in $FeatureToggles.Keys) { $Selection[$Id] = [bool]$FeatureToggles[$Id].IsChecked }
  $Path = Join-Path $env:TEMP ("mixbox-features-" + [Guid]::NewGuid().ToString('N') + '.json')
  [IO.File]::WriteAllText($Path, ($Selection | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
  return $Path
}

function Begin-Install {
  (Ui 'ProgressDetail').Text = if ((Ui 'InstallComfyOption').IsChecked) { 'Downloading and verifying official ComfyUI Desktop…' } elseif ((Ui 'DownloadModelsToggle').IsChecked) { 'Preparing selected model and custom-node downloads…' } else { 'Saving the portable configuration…' }
  Show-Page 4
  $FeatureFile = Write-FeatureSelection
  $Url = (Ui 'ComfyUrlBox').Text.Trim()
  $Comfy = (Ui 'ComfyPathBox').Text.Trim()
  $Models = (Ui 'ModelsPathBox').Text.Trim()
  $ComfyMode = if ((Ui 'InstallComfyOption').IsChecked) { 'desktop' } else { 'existing' }
  $InstallDependencies = [bool](Ui 'DownloadModelsToggle').IsChecked
  $Token = (Ui 'HfTokenBox').Password
  $EngineArguments = '-NoProfile -ExecutionPolicy Bypass -File ' + (Quote-Argument $EngineFile) +
    ' -NonInteractive -SkipLaunch -ComfyUrl ' + (Quote-Argument $Url) +
    ' -ComfyPath ' + (Quote-Argument $Comfy) +
    ' -ModelsPath ' + (Quote-Argument $Models) +
    ' -FeatureConfigFile ' + (Quote-Argument $FeatureFile) +
    ' -ComfyMode ' + (Quote-Argument $ComfyMode)
  if ($InstallDependencies) { $EngineArguments += ' -InstallDependencies' }
  $Work = [pscustomobject]@{
    EngineArguments = $EngineArguments
    FeatureFile = $FeatureFile
    HfToken = $Token
  }

  $Worker = New-Object System.ComponentModel.BackgroundWorker
  $Worker.WorkerReportsProgress = $true
  $Worker.add_DoWork({
    param($Sender, $Event)
    $WorkItem = $Event.Argument
    try {
      $Info = New-Object System.Diagnostics.ProcessStartInfo
      $Info.FileName = 'powershell.exe'
      $Info.Arguments = $WorkItem.EngineArguments
      $Info.UseShellExecute = $false
      $Info.CreateNoWindow = $true
      $Info.RedirectStandardOutput = $true
      $Info.RedirectStandardError = $true
      if ($WorkItem.HfToken) { $Info.EnvironmentVariables['HF_TOKEN'] = $WorkItem.HfToken }
      $Process = New-Object System.Diagnostics.Process
      $Process.StartInfo = $Info
      [void]$Process.Start()
      $OutputLines = New-Object System.Collections.Generic.List[string]
      while (-not $Process.StandardOutput.EndOfStream) {
        $Line = $Process.StandardOutput.ReadLine()
        if ($Line) {
          $OutputLines.Add($Line)
          $Sender.ReportProgress(0, $Line)
        }
      }
      $ErrorOutput = $Process.StandardError.ReadToEnd()
      $Process.WaitForExit()
      $Event.Result = [pscustomobject]@{ ExitCode = $Process.ExitCode; Output = ($OutputLines -join "`n"); Error = $ErrorOutput; FeatureFile = $WorkItem.FeatureFile }
    } catch {
      if ($WorkItem.FeatureFile -and (Test-Path $WorkItem.FeatureFile)) {
        Remove-Item $WorkItem.FeatureFile -Force -ErrorAction SilentlyContinue
      }
      throw
    }
  })
  $Worker.add_ProgressChanged({
    param($Sender, $Event)
    if ($Event.UserState) { (Ui 'ProgressDetail').Text = [string]$Event.UserState }
  })
  $Worker.add_RunWorkerCompleted({
    param($Sender, $Event)
    if ($null -ne $Event.Error) {
      (Ui 'ErrorText').Text = $Event.Error.Message
      Show-Page 6
      return
    }
    $Result = $Event.Result
    if ($Result.FeatureFile -and (Test-Path $Result.FeatureFile)) {
      Remove-Item $Result.FeatureFile -Force -ErrorAction SilentlyContinue
    }
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
    $Text.Text = 'Connected. ComfyUI is ready to answer Mix Studio.'
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
$HasExistingComfy = -not [string]::IsNullOrWhiteSpace((Ui 'ComfyPathBox').Text)
(Ui 'ExistingComfyOption').IsChecked = $HasExistingComfy
(Ui 'InstallComfyOption').IsChecked = -not $HasExistingComfy

$SavedFeatures = Property-Or $Settings 'features' ([pscustomobject]@{})
$HasSavedFeatureSelection = @($SavedFeatures.PSObject.Properties).Count -gt 0
$ConfiguredBefore = Test-Path $InstallFile
(Ui 'DownloadModelsToggle').IsChecked = -not $ConfiguredBefore
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
    $FreshDefault = if ($ConfiguredBefore -and -not $HasSavedFeatureSelection) { $true } else { [bool]$Feature.default }
    $Toggle.IsChecked = [bool](Property-Or $SavedFeatures ([string]$Feature.id) $FreshDefault)
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
  (Ui 'ExistingComfyOption').IsChecked = $true
  $Chosen = Select-Folder 'Select the existing ComfyUI folder' (Ui 'ComfyPathBox').Text
  (Ui 'ComfyPathBox').Text = $Chosen
  if ($Chosen -and -not (Ui 'ModelsPathBox').Text.Trim()) { (Ui 'ModelsPathBox').Text = Join-Path $Chosen 'models' }
})
(Ui 'BrowseModelsButton').Add_Click({
  (Ui 'ExistingComfyOption').IsChecked = $true
  (Ui 'ModelsPathBox').Text = Select-Folder 'Select the models folder used by ComfyUI' (Ui 'ModelsPathBox').Text
})
(Ui 'RetryButton').Add_Click({ Update-Review; Show-Page 3 })
(Ui 'LaunchButton').Add_Click({
  Start-Process (Join-Path $Root 'start.bat') -WorkingDirectory $Root
  $Window.Close()
})

Show-Page 0
[void]$Window.ShowDialog()
